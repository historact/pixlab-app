const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { sendError } = require('../utils/errorResponse');
const fs = require('fs');
const { getOrCreateUsageForKey, checkMonthlyQuota, recordUsageAndLog } = require('../usage');

// Per-IP per-day store for H2I (public keys only)
const h2iRateStore = new Map();
const H2I_DAILY_LIMIT = 5;

function h2iDailyLimit(req, res, next) {
  // Owner keys are unlimited
  if (req.apiKeyType !== 'public') {
    return next();
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `${ip}:${today}`;

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
  app.post('/v1/h2i', checkApiKey, publicTimeoutMiddleware, h2iDailyLimit, async (req, res) => {
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

    try {
      let { html, css, width: reqWidth, height: reqHeight, format: reqFormat } = req.body;

      if (!html) {
        hadError = true;
        errorCode = 'missing_field';
        errorMessage = "The 'html' field is required.";
        await recordUsageAndLog({
          apiKeyRecord: req.customerKey || null,
          endpoint: '/v1/h2i',
          action: 'html_to_image',
          filesProcessed: 0,
          bytesIn,
          bytesOut: 0,
          ok: false,
          errorCode,
          errorMessage,
          paramsForLog: {
            width,
            height,
            format: format || 'png',
          },
        });
        return sendError(res, 400, 'missing_field', "The 'html' field is required.", {
          hint: "Send a JSON body with an 'html' string.",
        });
      }

      if (isCustomer) {
        const usage = await getOrCreateUsageForKey(req.customerKey.id, req.customerKey.monthly_quota);
        const quota = checkMonthlyQuota(usage, req.customerKey.monthly_quota, filesToConsume);
        if (!quota.allowed) {
          hadError = true;
          errorCode = 'monthly_quota_exceeded';
          errorMessage = 'Your monthly Pixlab quota has been exhausted.';
          await recordUsageAndLog({
            apiKeyRecord: req.customerKey || null,
            endpoint: '/v1/h2i',
            action: 'html_to_image',
            filesProcessed: 0,
            bytesIn,
            bytesOut: 0,
            ok: false,
            errorCode,
            errorMessage,
            paramsForLog: {
              width,
              height,
              format: format || 'png',
            },
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
      width = parseInt(reqWidth || 1000, 10);
      height = parseInt(reqHeight || 1500, 10);

      format = reqFormat || 'png';
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

      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

      const fileName = `${uuidv4()}.${screenshotType === 'jpeg' ? 'jpg' : 'png'}`;
      const filePath = path.join(h2iDir, fileName);

      const bodyEl = await page.$('body');
      const screenshotOptions = { path: filePath, type: screenshotType };
      if (screenshotType === 'jpeg') {
        screenshotOptions.quality = 80;
      }

      await bodyEl.screenshot(screenshotOptions);

      await browser.close();

      const stats = fs.statSync(filePath);
      bytesOut = stats.size;

      const imageUrl = `${baseUrl}/h2i/${fileName}`;
      await recordUsageAndLog({
        apiKeyRecord: req.customerKey || null,
        endpoint: '/v1/h2i',
        action: 'html_to_image',
        filesProcessed: filesToConsume,
        bytesIn,
        bytesOut,
        ok: true,
        errorCode: null,
        errorMessage: null,
        paramsForLog: {
          width,
          height,
          format: normalizedFormat,
        },
      });

      res.json({ url: imageUrl });
    } catch (e) {
      hadError = true;
      errorCode = 'html_render_failed';
      errorMessage = 'Failed to render HTML to image.';
      console.error(e);
      await recordUsageAndLog({
        apiKeyRecord: req.customerKey || null,
        endpoint: '/v1/h2i',
        action: 'html_to_image',
        filesProcessed: 0,
        bytesIn,
        bytesOut: 0,
        ok: false,
        errorCode,
        errorMessage,
        paramsForLog: {
          width,
          height,
          format: format || 'png',
        },
      });
      sendError(res, 500, 'html_render_failed', 'Failed to render HTML to image.', {
        hint: 'Check your HTML/CSS. If the issue persists with valid HTML, contact support.',
        details: e,
      });
    }
  });
};
