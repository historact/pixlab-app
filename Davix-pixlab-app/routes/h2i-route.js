const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

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
    return res.status(429).json({
      error: 'daily_limit_reached',
      message: 'You have reached the free daily limit for HTML → Image. Please try again tomorrow.',
    });
  }

  h2iRateStore.set(key, count + 1);
  next();
}

module.exports = function (app, { checkApiKey, h2iDir, baseUrl, publicTimeoutMiddleware }) {
  // POST https://pixlab.davix.dev/v1/h2i
  app.post('/v1/h2i', checkApiKey, publicTimeoutMiddleware, h2iDailyLimit, async (req, res) => {
    try {
      let { html, css, width, height, format } = req.body;

      if (!html) {
        return res.status(400).json({ error: 'Missing "html" in body' });
      }

      // Default Pinterest-style size
      width = parseInt(width || 1000, 10);
      height = parseInt(height || 1500, 10);

      const normalizedFormat = (format || 'png').toLowerCase();
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

      const imageUrl = `${baseUrl}/h2i/${fileName}`;
      res.json({ url: imageUrl });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'render_failed', details: String(e) });
    }
  });
};
