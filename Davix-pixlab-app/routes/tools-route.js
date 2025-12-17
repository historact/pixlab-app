const multer = require('multer');
const sharp = require('sharp');
const exifr = require('exifr');
const crypto = require('crypto');
const { sendError } = require('../utils/errorResponse');
const {
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  recordUsageAndLog,
  getUsagePeriodForKey,
} = require('../usage');
const { extractClientInfo } = require('../utils/requestInfo');

const upload = multer();

const PUBLIC_MAX_FILES = 10;
const PUBLIC_MAX_BYTES = 10 * 1024 * 1024;
const PUBLIC_MAX_DIMENSION = 6000;
const toolsFileRateStore = new Map();
const TOOLS_DAILY_LIMIT = 10;

function getIp(req) {
  const { ip } = extractClientInfo(req);
  return ip || 'unknown';
}

function checkToolsDailyLimit(req, res, next) {
  if (req.apiKeyType !== 'public') return next();
  const ip = getIp(req);
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const incoming = (req.files || []).length;
  const count = toolsFileRateStore.get(key) || 0;
  if (count + incoming > TOOLS_DAILY_LIMIT) {
    return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
      hint: 'Try again tomorrow or contact support if you need higher limits.',
    });
  }
  toolsFileRateStore.set(key, count + incoming);
  next();
}

function parseToolsList(str) {
  if (!str) return ['metadata'];
  return str
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

async function getPalette(buffer, size) {
  const sample = await sharp(buffer).resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = sample;
  const counts = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, size);
  const palette = sorted.map(([k]) => {
    const [r, g, b] = k.split(',').map(Number);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
      .toString(16)
      .padStart(2, '0')}`;
  });
  return {
    dominant: palette[0] || null,
    palette,
  };
}

async function getExif(buffer, includeRaw) {
  try {
    const exifData = await exifr.parse(buffer);
    if (!includeRaw) {
      return {
        camera: exifData?.Make || exifData?.Model || null,
        dateTime: exifData?.DateTimeOriginal || exifData?.CreateDate || null,
        gps: exifData?.gps || null,
        orientation: exifData?.Orientation || null,
      };
    }
    return exifData || null;
  } catch (e) {
    return null;
  }
}

async function computePhash(buffer) {
  const img = await sharp(buffer).resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { data } = img;
  const avg = data.reduce((s, v) => s + v, 0) / data.length;
  let bits = '';
  data.forEach(v => {
    bits += v > avg ? '1' : '0';
  });
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const chunk = bits.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

function computeHash(buffer, type) {
  const hash = crypto.createHash(type);
  hash.update(buffer);
  return hash.digest('hex');
}

module.exports = function (app, { checkApiKey, toolsDir, baseUrl, publicTimeoutMiddleware }) {
  app.post(
    '/v1/tools',
    checkApiKey,
    publicTimeoutMiddleware,
    upload.array('images', 50),
    (req, res, next) => {
      if (req.apiKeyType === 'public' && req.files && req.files.length > PUBLIC_MAX_FILES) {
        return sendError(res, 413, 'too_many_files', 'Too many files were uploaded in one request.', {
          hint: 'Reduce the number of files to 10 or fewer.',
        });
      }
      next();
    },
    checkToolsDailyLimit,
    async (req, res) => {
      const isCustomer = req.apiKeyType === 'customer';
      const { ip, userAgent } = extractClientInfo(req);
      const files = req.files || [];
      const filesToConsume = Math.max(files.length, 1);
      const bytesIn = files.reduce((s, f) => s + (f.size || f.buffer?.length || 0), 0);
      let hadError = false;
      let errorCode = null;
      let errorMessage = null;
      let usageRecord = null;
      let toolsUsed = null;
      let includeRawExifUsed = null;

      try {
        const usagePeriod = isCustomer ? getUsagePeriodForKey(req.customerKey, req.customerKey?.plan) : null;

        if (isCustomer) {
          usageRecord = await getOrCreateUsageForKey(
            req.customerKey.id,
            usagePeriod,
            req.customerKey.monthly_quota
          );
          const quota = checkMonthlyQuota(usageRecord, req.customerKey.monthly_quota, filesToConsume);
          if (!quota.allowed) {
            hadError = true;
            errorCode = 'monthly_quota_exceeded';
            errorMessage = 'Your monthly Pixlab quota has been exhausted.';
            return res.status(429).json({
              error: 'monthly_quota_exceeded',
              message: 'Your monthly Pixlab quota has been exhausted.',
              details: {
                limit: req.customerKey.monthly_quota,
                used: usageRecord.used_files,
                remaining: quota.remaining,
                period: usageRecord.period,
              },
            });
          }
        }

        if (!files.length) {
          hadError = true;
          errorCode = 'missing_field';
          errorMessage = 'An image file is required.';
          return sendError(res, 400, 'missing_field', 'An image file is required.', {
            hint: "Upload at least one file in the 'images' field.",
          });
        }

        if (req.apiKeyType === 'public') {
          const totalSize = files.reduce((s, f) => s + f.size, 0);
          if (totalSize > PUBLIC_MAX_BYTES) {
            hadError = true;
            errorCode = 'payload_too_large';
            errorMessage = 'The uploaded files are too large.';
            return sendError(res, 413, 'payload_too_large', 'The uploaded files are too large.', {
              hint: 'Reduce total upload size to 10 MB or less.',
            });
          }
        }

        const tools = parseToolsList(req.body.tools || req.body['tools[]']);
        const includeRawExif = req.body.includeRawExif === 'true';
        toolsUsed = tools;
        includeRawExifUsed = req.body?.includeRawExif || null;
        const paletteSize = req.body.paletteSize ? parseInt(req.body.paletteSize, 10) : 5;
        const hashType = (req.body.hashType || 'phash').toLowerCase();

        const results = [];

        for (const file of files) {
          const meta = await sharp(file.buffer).metadata();
          if (
            req.apiKeyType === 'public' &&
            meta.width &&
            meta.height &&
            (meta.width > PUBLIC_MAX_DIMENSION || meta.height > PUBLIC_MAX_DIMENSION)
          ) {
            const scale = Math.min(PUBLIC_MAX_DIMENSION / meta.width, PUBLIC_MAX_DIMENSION / meta.height);
            const resized = await sharp(file.buffer)
              .resize({ width: Math.round(meta.width * scale), height: Math.round(meta.height * scale), fit: 'inside', withoutEnlargement: true })
              .toBuffer();
            file.buffer = resized;
          }

          const toolsResult = {};

          if (tools.includes('metadata')) {
            toolsResult.metadata = {
              format: meta.format || null,
              mimeType: meta.format ? `image/${meta.format}` : null,
              width: meta.width || null,
              height: meta.height || null,
              sizeBytes: file.buffer.length,
              exif: await getExif(file.buffer, includeRawExif),
            };
          }

          if (tools.includes('colors')) {
            toolsResult.colors = await getPalette(file.buffer, paletteSize || 5);
          }

          if (tools.includes('detect-format')) {
            toolsResult['detect-format'] = {
              format: meta.format || null,
              mimeType: meta.format ? `image/${meta.format}` : null,
              isAnimated: meta.pages && meta.pages > 1 ? true : false,
            };
          }

          if (tools.includes('orientation')) {
            let orientation = 'square';
            if (meta.width && meta.height) {
              if (meta.width > meta.height) orientation = 'landscape';
              else if (meta.height > meta.width) orientation = 'portrait';
            }
            const exifData = await getExif(file.buffer, false);
            const exifOrientation = exifData?.orientation;
            let suggestedRotation = 0;
            if (exifOrientation === 3) suggestedRotation = 180;
            if (exifOrientation === 6) suggestedRotation = 90;
            if (exifOrientation === 8) suggestedRotation = 270;
            toolsResult.orientation = {
              orientation,
              needsRotation: Boolean(exifOrientation && exifOrientation !== 1),
              suggestedRotation,
            };
          }

          if (tools.includes('hash')) {
            let hashValue;
            let hashUsed = hashType;
            if (hashType === 'md5' || hashType === 'sha1') {
              hashValue = computeHash(file.buffer, hashType);
            } else {
              hashValue = await computePhash(file.buffer);
              hashUsed = 'phash';
            }
            toolsResult.hash = {
              hashType: hashUsed,
              hash: hashValue,
            };
          }

          const entry = {
            originalName: file.originalname || null,
            tools: toolsResult,
          };

          results.push(entry);
        }

        res.json({ results });
      } catch (err) {
        hadError = true;
        errorCode = 'tool_processing_failed';
        errorMessage = 'Failed to analyze the image.';
        console.error(err);
        sendError(res, 500, 'tool_processing_failed', 'Failed to analyze the image.', {
          hint: 'Verify that the uploaded image is valid. If the error persists, contact support.',
          details: err,
        });
      } finally {
        if (isCustomer && req.customerKey) {
          await recordUsageAndLog({
            apiKeyRecord: req.customerKey,
            endpoint: 'tools',
            action: 'tool_run',
            filesProcessed: hadError ? 0 : filesToConsume,
            bytesIn,
            bytesOut: 0,
            status: res.statusCode || (hadError ? 500 : 200),
            ip,
            userAgent,
            ok: !hadError,
            errorCode: hadError ? errorCode : null,
            errorMessage: hadError ? errorMessage : null,
            paramsForLog: {
              tools: toolsUsed,
              includeRawExif: includeRawExifUsed,
            },
            usagePeriod: isCustomer
              ? getUsagePeriodForKey(req.customerKey, req.customerKey?.plan)
              : null,
          });
        }
      }
    }
  );
};
