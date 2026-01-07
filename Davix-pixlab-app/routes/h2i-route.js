const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { sendError } = require('../utils/errorResponse');
const fs = require('fs');
const dns = require('dns');
const net = require('net');
const {
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  recordUsageAndLog,
  getUsagePeriodForKey,
} = require('../usage');
const { extractClientInfo } = require('../utils/requestInfo');
const { wrapAsync } = require('../utils/wrapAsync');
const { createEndpointGuard } = require('../utils/limits');
const { buildSignedUrl } = require('../utils/signedUrls');
const { incrementAndGetDailyCount, getUtcDayString } = require('../utils/rateLimitsDaily');
const {
  getH2iNetworkConfig,
  getPuppeteerNoSandbox,
  getH2iDnsRebindingMode,
  getRateLimitDbFailureMode,
  getCustomerBurstAppliesTo,
} = require('../utils/config');
const { createCustomerBurstLimiter } = require('../utils/burstLimitMiddleware');

function parseDailyLimitEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseBoolean(val, defaultValue = false) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return defaultValue;
}

// Per-IP per-day store for H2I (public keys only)
const h2iRateStore = new Map();
const H2I_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_H2I_DAILY_LIMIT', 5);
const MAX_HTML_CHARS = parseInt(process.env.MAX_HTML_CHARS, 10) || 100_000;
const MAX_RENDER_PIXELS = parseInt(process.env.MAX_RENDER_PIXELS, 10) || 20_000_000;
const MAX_RENDER_WIDTH = parseInt(process.env.MAX_RENDER_WIDTH, 10) || 5_000;
const MAX_RENDER_HEIGHT = parseInt(process.env.MAX_RENDER_HEIGHT, 10) || 8_000;
const h2iEndpoint = 'h2i';
const h2iEndpointGuard = createEndpointGuard(h2iEndpoint);
const dnsCache = new Map();
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;
const debugInternal = process.env.DAVIX_DEBUG_INTERNAL === '1';
const { blockPrivateNetwork, allowFileScheme } = getH2iNetworkConfig();
const dnsRebindingMode = getH2iDnsRebindingMode();
const burstAppliesTo = getCustomerBurstAppliesTo();
const burstLimiter =
  burstAppliesTo === 'all' || burstAppliesTo === 'h2i' ? createCustomerBurstLimiter('h2i') : null;

function logBlockedRequest(url, reason) {
  if (!debugInternal) return;
  console.warn('[h2i][ssrf] blocked request', { url, reason });
}

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isFinite(p))) return false;
  const [a, b, c] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const ipv4 = normalized.slice(7);
    return isPrivateIpv4(ipv4);
  }
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80') || normalized.startsWith('fec0')) return true;
  if (normalized.startsWith('2001:db8')) return true;
  if (normalized.startsWith('ff')) return true;
  return false;
}

function isPrivateIp(ip) {
  const ipType = net.isIP(ip);
  if (ipType === 4) return isPrivateIpv4(ip);
  if (ipType === 6) return isPrivateIpv6(ip);
  return false;
}

async function resolveHost(hostname, { bypassCache = false } = {}) {
  if (!bypassCache) {
    const cached = dnsCache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.addresses;
    }
  }
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map(r => r.address);
  dnsCache.set(hostname, { addresses, expiresAt: Date.now() + DNS_CACHE_TTL_MS });
  return addresses;
}

function normalizeAddressSet(addresses) {
  return new Set((addresses || []).map(addr => addr.trim()).filter(Boolean));
}

function addressSetsEqual(aSet, bSet) {
  if (aSet.size !== bSet.size) return false;
  for (const value of aSet) {
    if (!bSet.has(value)) return false;
  }
  return true;
}

async function handleH2iRequestInterception(request, { pinnedHosts } = {}) {
  const url = request.url();
  if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) {
    return request.continue();
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return request.continue();
  }

  const protocol = parsed.protocol;
  if (protocol === 'file:') {
    if (allowFileScheme) return request.continue();
    logBlockedRequest(url, 'file_scheme_blocked');
    return request.abort();
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    return request.continue();
  }

  if (!blockPrivateNetwork) return request.continue();

  const hostname = parsed.hostname;
  if (!hostname) return request.continue();

  const normalizedHostname = hostname.toLowerCase();
  if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.local')) {
    logBlockedRequest(url, 'localhost_blocked');
    return request.abort();
  }

  try {
    const requireFreshLookup = dnsRebindingMode === 'strict' || dnsRebindingMode === 'pin';
    const addresses = await resolveHost(normalizedHostname, { bypassCache: requireFreshLookup });
    if (!addresses.length) {
      logBlockedRequest(url, 'dns_empty');
      return request.abort();
    }
    if (addresses.some(addr => isPrivateIp(addr) || addr === '169.254.169.254')) {
      logBlockedRequest(url, 'private_ip_blocked');
      return request.abort();
    }
    if (dnsRebindingMode === 'pin' && pinnedHosts) {
      const incomingSet = normalizeAddressSet(addresses);
      const existingSet = pinnedHosts.get(normalizedHostname);
      if (existingSet && !addressSetsEqual(existingSet, incomingSet)) {
        logBlockedRequest(url, 'dns_rebinding_detected');
        return request.abort();
      }
      if (!existingSet) {
        pinnedHosts.set(normalizedHostname, incomingSet);
      }
    }
  } catch (err) {
    if (blockPrivateNetwork) {
      logBlockedRequest(url, 'dns_lookup_failed');
      return request.abort();
    }
  }

  return request.continue();
}

function h2iDailyLimit(req, res, next) {
  // Owner keys are unlimited
  if (req.apiKeyType !== 'public') {
    return next();
  }

  const { ip } = extractClientInfo(req);
  const clientIp = ip || '0.0.0.0';
  const today = getUtcDayString();
  const key = `${clientIp}:${today}`;

  (async () => {
    try {
      const count = await incrementAndGetDailyCount({
        scope: 'h2i',
        ip: clientIp,
        incrementBy: 1,
        dayUtc: today,
      });
      if (count > H2I_DAILY_LIMIT) {
        return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
          hint: 'Try again tomorrow or contact support if you need higher limits.',
        });
      }
      return next();
    } catch (err) {
      const mode = getRateLimitDbFailureMode();
      if (mode === 'closed') {
        return sendError(res, 503, 'rate_limit_store_unavailable', 'Rate limit service unavailable.', {
          hint: 'Try again later.',
        });
      }
      if (mode === 'open') {
        return next();
      }
      console.warn('[rate_limit] Failed to update rate_limits_daily, falling back to memory store.', err);
      const count = h2iRateStore.get(key) || 0;
      if (count >= H2I_DAILY_LIMIT) {
        return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
          hint: 'Try again tomorrow or contact support if you need higher limits.',
        });
      }
      h2iRateStore.set(key, count + 1);
      return next();
    }
  })();
}

module.exports = function (app, { checkApiKey, h2iDir, baseUrl, timeoutMiddlewareFactory }) {
  // POST https://pixlab.davix.dev/v1/h2i
  app.post(
    '/v1/h2i',
    checkApiKey,
    h2iEndpointGuard,
    burstLimiter || ((req, res, next) => next()),
    timeoutMiddlewareFactory(h2iEndpoint),
    h2iDailyLimit,
    wrapAsync(async (req, res) => {
    const action = (req.body?.action || '').toString().toLowerCase();
    if (!action) {
      return sendError(res, 400, 'invalid_parameter', 'missing action');
    }
    if (!['image', 'pdf'].includes(action)) {
      return sendError(res, 400, 'invalid_parameter', 'Invalid action. Use action=image or action=pdf.', {
        hint: 'Use action=image or action=pdf.',
      });
    }

    const isCustomer = req.apiKeyType === 'customer';
    const filesToConsume = 1;
    const bytesIn = Buffer.byteLength(req.body?.html || '') + Buffer.byteLength(req.body?.css || '');
    let bytesOut = 0;
    let hadError = false;
    let errorCode = null;
    let errorMessage = null;
    let width = null;
    let height = null;
    let format = null;
    let usageAction = 'html_to_image';
    const { ip, userAgent } = extractClientInfo(req);
    let browser = null;
    let page = null;

    try {
      let {
        html,
        css,
        width: reqWidth,
        height: reqHeight,
        format: reqFormat,
        pdfFormat,
        pdfLandscape,
        pdfMargin,
        preferCSSPageSize,
        scale,
        printMode,
        printBackground,
      } = req.body;

      const outputMode = action === 'pdf' ? 'pdf' : 'image';
      if (outputMode !== 'image' && outputMode !== 'pdf') {
        hadError = true;
        errorCode = 'invalid_parameter';
        errorMessage = 'Invalid output mode.';
        await recordUsageAndLog({
          apiKeyRecord: req.customerKey || null,
          endpoint: 'h2i',
          action: usageAction,
          filesProcessed: 0,
          bytesIn,
          bytesOut: 0,
          status: 400,
          ip,
          userAgent,
          ok: false,
          errorCode,
          errorMessage,
          paramsForLog: {
            width,
            height,
            format: format || 'png',
            output: outputMode,
          },
          usagePeriod: isCustomer ? getUsagePeriodForKey(req.customerKey, req.customerKey?.plan) : null,
        });
        return sendError(res, 400, 'invalid_parameter', 'Invalid output mode.', {
          hint: 'Use output=image or output=pdf.',
        });
      }

      usageAction = outputMode === 'pdf' ? 'html_to_pdf' : 'html_to_image';

      if (typeof html === 'string' && html.length > MAX_HTML_CHARS) {
        hadError = true;
        errorCode = 'html_too_large';
        errorMessage = `HTML exceeds maximum length of ${MAX_HTML_CHARS} characters.`;
        await recordUsageAndLog({
          apiKeyRecord: req.customerKey || null,
          endpoint: 'h2i',
          action: 'html_to_image',
          filesProcessed: 0,
          bytesIn,
          bytesOut: 0,
          status: 413,
          ip,
          userAgent,
          ok: false,
          errorCode,
          errorMessage,
          paramsForLog: {
            width,
            height,
            format: format || 'png',
            output: outputMode,
          },
          usagePeriod: isCustomer ? getUsagePeriodForKey(req.customerKey, req.customerKey?.plan) : null,
        });
        return sendError(res, 413, 'html_too_large', errorMessage);
      }

      const usagePeriod = isCustomer ? getUsagePeriodForKey(req.customerKey, req.customerKey?.plan) : null;

      if (!html) {
        hadError = true;
        errorCode = 'missing_field';
        errorMessage = "The 'html' field is required.";
        await recordUsageAndLog({
          apiKeyRecord: req.customerKey || null,
          endpoint: 'h2i',
          action: 'html_to_image',
          filesProcessed: 0,
          bytesIn,
          bytesOut: 0,
          status: 400,
          ip,
          userAgent,
          ok: false,
          errorCode,
          errorMessage,
          paramsForLog: {
            width,
            height,
            format: format || 'png',
            output: outputMode,
          },
          usagePeriod,
        });
        return sendError(res, 400, 'missing_field', "The 'html' field is required.", {
            hint: "Send a JSON body with an 'html' string.",
          });
      }

      if (isCustomer) {
        const usage = await getOrCreateUsageForKey(
          req.customerKey.id,
          usagePeriod,
          req.customerKey.monthly_quota
        );
        const quota = checkMonthlyQuota(usage, req.customerKey.monthly_quota, filesToConsume);
        if (!quota.allowed) {
          hadError = true;
          errorCode = 'monthly_quota_exceeded';
          errorMessage = 'Your monthly Pixlab quota has been exhausted.';
          await recordUsageAndLog({
          apiKeyRecord: req.customerKey || null,
          endpoint: 'h2i',
          action: 'html_to_image',
          filesProcessed: 0,
          bytesIn,
          bytesOut: 0,
          status: 429,
          ip,
          userAgent,
          ok: false,
          errorCode,
          errorMessage,
          paramsForLog: {
            width,
            height,
            format: format || 'png',
            output: outputMode,
          },
            usagePeriod,
          });
          return res.status(429).json({
            error: 'monthly_quota_exceeded',
            message: 'Your monthly Pixlab quota has been exhausted.',
            details: {
              limit: req.customerKey.monthly_quota,
              used: usage.used_files,
              remaining: quota.remaining,
              period: usage.period,
            },
          });
        }
      }

      // Default Pinterest-style size
      const parsedWidth = parseInt(reqWidth, 10);
      const parsedHeight = parseInt(reqHeight, 10);
      const safeWidth = Number.isFinite(parsedWidth) ? parsedWidth : 1000;
      const safeHeight = Number.isFinite(parsedHeight) ? parsedHeight : 1500;

      width = Math.min(Math.max(safeWidth, 1), MAX_RENDER_WIDTH);
      height = Math.min(Math.max(safeHeight, 1), MAX_RENDER_HEIGHT);

      const totalPixels = width * height;
      if (totalPixels > MAX_RENDER_PIXELS) {
        hadError = true;
        errorCode = 'render_size_exceeded';
        errorMessage = `Requested render size exceeds maximum pixels (${MAX_RENDER_PIXELS}).`;
        await recordUsageAndLog({
          apiKeyRecord: req.customerKey || null,
          endpoint: 'h2i',
          action: 'html_to_image',
          filesProcessed: 0,
          bytesIn,
          bytesOut: 0,
          status: 400,
          ip,
          userAgent,
          ok: false,
          errorCode,
          errorMessage,
          paramsForLog: {
            width,
            height,
            format: reqFormat || 'png',
            output: outputMode,
          },
          usagePeriod,
        });
        return sendError(res, 400, 'render_size_exceeded', errorMessage, {
          hint: 'Reduce width/height or target a smaller viewport.',
        });
      }

      format = outputMode === 'pdf' ? 'pdf' : (reqFormat || 'png');
      const normalizedFormat = format.toLowerCase();
      const screenshotType = normalizedFormat === 'jpeg' ? 'jpeg' : 'png';

      let fullHtml;
      if (css) {
        fullHtml = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <style>
            ${css}
            </style>
          </head>
          <body style="margin:0;padding:0;">
            ${html}
          </body>
          </html>
        `;
      } else {
        fullHtml = html;
      }

      const launchArgs = getPuppeteerNoSandbox() ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
      browser = await puppeteer.launch({ args: launchArgs });

      page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setRequestInterception(true);
      const pinnedHosts = dnsRebindingMode === 'pin' ? new Map() : null;
      page.on('request', request => {
        handleH2iRequestInterception(request, { pinnedHosts }).catch(err => {
          if (debugInternal) {
            console.warn('[h2i][ssrf] request interception error', err);
          }
          request.abort();
        });
      });
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

      let outputUrl = null;
      let fileName = null;

      if (outputMode === 'pdf') {
        const pdfFormatValue = (pdfFormat || 'A4').toString().toUpperCase() === 'LETTER' ? 'Letter' : 'A4';
        const pdfLandscapeValue = parseBoolean(pdfLandscape, false);
        const pdfMarginValue = Number.isFinite(parseInt(pdfMargin, 10)) ? parseInt(pdfMargin, 10) : 24;
        const preferCssSize = parseBoolean(preferCSSPageSize, true);
        const scaleValue = Number.isFinite(parseFloat(scale)) ? parseFloat(scale) : 1;
        const printBg = parseBoolean(printBackground, true);
        const printModeEnabled = parseBoolean(printMode, false);

        if (printModeEnabled) {
          await page.emulateMediaType('print');
        }

        fileName = `${uuidv4()}.pdf`;
        const filePath = path.join(h2iDir, fileName);
        await page.pdf({
          path: filePath,
          format: pdfFormatValue,
          landscape: pdfLandscapeValue,
          printBackground: printBg,
          preferCSSPageSize: preferCssSize,
          scale: scaleValue,
          margin: {
            top: `${pdfMarginValue}px`,
            right: `${pdfMarginValue}px`,
            bottom: `${pdfMarginValue}px`,
            left: `${pdfMarginValue}px`,
          },
        });

        const stats = fs.statSync(filePath);
        bytesOut = stats.size;
        outputUrl = buildSignedUrl(baseUrl, `/h2i/${fileName}`);
      } else {
        const bodyEl = await page.$('body');
        fileName = `${uuidv4()}.${screenshotType === 'jpeg' ? 'jpg' : 'png'}`;
        const filePath = path.join(h2iDir, fileName);

        const screenshotOptions = { path: filePath, type: screenshotType };
        if (screenshotType === 'jpeg') {
          screenshotOptions.quality = 80;
        }

        await bodyEl.screenshot(screenshotOptions);

        const stats = fs.statSync(filePath);
        bytesOut = stats.size;
        outputUrl = buildSignedUrl(baseUrl, `/h2i/${fileName}`);
      }

      await recordUsageAndLog({
        apiKeyRecord: req.customerKey || null,
        endpoint: 'h2i',
        action: usageAction,
        filesProcessed: filesToConsume,
        bytesIn,
        bytesOut,
        status: res.statusCode || 200,
        ip,
        userAgent,
        ok: true,
        errorCode: null,
        errorMessage: null,
        paramsForLog: {
          width,
          height,
          format: normalizedFormat,
          output: outputMode,
        },
      });

      res.json({ url: outputUrl });
    } catch (e) {
      hadError = true;
      errorCode = 'html_render_failed';
      errorMessage = 'Failed to render HTML to image.';
      console.error(e);
      await recordUsageAndLog({
        apiKeyRecord: req.customerKey || null,
        endpoint: 'h2i',
        action: usageAction,
        filesProcessed: 0,
        bytesIn,
        bytesOut: 0,
        status: 500,
        ip,
        userAgent,
        ok: false,
        errorCode,
        errorMessage,
        paramsForLog: {
          width,
          height,
          format: format || 'png',
          output: outputMode || 'image',
        },
        usagePeriod,
      });
      sendError(res, 500, 'html_render_failed', 'Failed to render HTML to image.', {
        hint: 'Check your HTML/CSS. If the issue persists with valid HTML, contact support.',
        details: e,
      });
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          // ignore close errors
        }
      }
    }
    })
  );
};
