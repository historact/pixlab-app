const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { sendError } = require('../utils/errorResponse');
const fs = require('fs');
const {
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  recordUsageAndLog,
  getUsagePeriodForKey,
} = require('../usage');
const { extractClientInfo } = require('../utils/requestInfo');
const { wrapAsync } = require('../utils/wrapAsync');

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

function h2iDailyLimit(req, res, next) {
  // Owner keys are unlimited
  if (req.apiKeyType !== 'public') {
    return next();
  }

  const { ip } = extractClientInfo(req);
  const clientIp = ip || 'unknown';

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `${clientIp}:${today}`;

  const count = h2iRateStore.get(key) || 0;

  if (count >= H2I_DAILY_LIMIT) {
    return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
      hint: 'Try again tomorrow or contact support if you need higher limits.',
    });
  }

  h2iRateStore.set(key, count + 1);
  next();
}

module.exports = function (app, { checkApiKey, h2iDir, baseUrl, publicTimeoutMiddleware }) {
  // POST https://pixlab.davix.dev/v1/h2i
  app.post('/v1/h2i', checkApiKey, publicTimeoutMiddleware, h2iDailyLimit, wrapAsync(async (req, res) => {
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

      browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width, height });
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
        outputUrl = `${baseUrl}/h2i/${fileName}`;
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
        outputUrl = `${baseUrl}/h2i/${fileName}`;
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
  }));
};
