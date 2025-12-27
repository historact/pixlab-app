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
const { wrapAsync } = require('../utils/wrapAsync');

const upload = multer();

function parseDailyLimitEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampInt(val, min, max, fallback) {
  const num = parseInt(val, 10);
  if (Number.isFinite(num)) {
    if (min !== undefined && num < min) return min;
    if (max !== undefined && num > max) return max;
    return num;
  }
  return fallback;
}

function clampNumber(val, min, max, fallback) {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (Number.isFinite(num)) {
    if (min !== undefined && num < min) return min;
    if (max !== undefined && num > max) return max;
    return num;
  }
  return fallback;
}

const PUBLIC_MAX_FILES = 10;
const PUBLIC_MAX_BYTES = 10 * 1024 * 1024;
const PUBLIC_MAX_DIMENSION = 6000;
const toolsFileRateStore = new Map();
const TOOLS_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_TOOLS_DAILY_LIMIT', 10);

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
  if (!str) return [];
  return str
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

function hammingDistanceHex(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += ((x >> 3) & 1) + ((x >> 2) & 1) + ((x >> 1) & 1) + (x & 1);
  }
  return dist;
}

function rgbToHex({ r, g, b }) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v || 0)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
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

async function computeQualityScore(buffer, target) {
  const sampleSize = clampInt(target, 64, 512, 256);
  const { data, info } = await sharp(buffer)
    .resize(sampleSize, sampleSize, { fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const get = (x, y) => data[y * w + x];
  let sum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const val =
        -get(x - 1, y) - get(x + 1, y) - get(x, y - 1) - get(x, y + 1) +
        4 * get(x, y);
      sum += val * val;
      count++;
    }
  }
  const variance = count ? sum / count : 0;
  const sharpness = variance;
  const score = Math.max(0, Math.min(100, Math.log10(1 + sharpness) * 20));
  return { score, sharpness };
}

async function estimateTransparency(buffer, sampleSizeInput) {
  const sampleSize = clampInt(sampleSizeInput, 16, 128, 64);
  const { data, info } = await sharp(buffer)
    .resize(sampleSize, sampleSize, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let transparent = 0;
  let total = width * height;
  for (let i = 0; i < data.length; i += channels) {
    const alpha = data[i + 3];
    if (alpha <= 10) transparent += 1;
  }
  return { hasAlpha: true, ratioTransparent: total ? transparent / total : 0 };
}

async function estimateEfficiency(buffer, format, quality) {
  if (!format) {
    return {
      originalSizeBytes: buffer.length,
      originalSizeKB: buffer.length / 1024,
      estimatedSizeBytes: null,
      ratio: null,
      percentSaved: null,
    };
  }
  const fmt = format.toLowerCase();
  const q = clampInt(quality, 1, 100, 80);
  let instance = sharp(buffer);
  if (fmt === 'jpeg' || fmt === 'jpg') instance = instance.jpeg({ quality: q });
  else if (fmt === 'webp') instance = instance.webp({ quality: q });
  else if (fmt === 'avif') instance = instance.avif({ quality: q });
  else if (fmt === 'png') instance = instance.png();
  else {
    return {
      originalSizeBytes: buffer.length,
      originalSizeKB: buffer.length / 1024,
      estimatedSizeBytes: null,
      ratio: null,
      percentSaved: null,
    };
  }
  const estBuffer = await instance.toBuffer();
  const ratio = buffer.length ? estBuffer.length / buffer.length : null;
  return {
    originalSizeBytes: buffer.length,
    originalSizeKB: buffer.length / 1024,
    estimatedSizeBytes: estBuffer.length,
    ratio,
    percentSaved: ratio !== null ? (1 - ratio) * 100 : null,
  };
}

module.exports = function (app, { checkApiKey, toolsDir, baseUrl, publicTimeoutMiddleware }) {
  app.post(
    '/v1/tools',
    checkApiKey,
    publicTimeoutMiddleware,
    upload.array('images', 50),
    (req, res, next) => {
      const action = (req.body?.action || '').toString().toLowerCase();
      if (!action) {
        return sendError(res, 400, 'invalid_parameter', 'missing action');
      }
      if (!['single', 'multitask'].includes(action)) {
        return sendError(res, 400, 'invalid_parameter', 'Invalid action.', {
          hint: 'Use action=single or action=multitask.',
        });
      }
      next();
    },
    (req, res, next) => {
      if (req.apiKeyType === 'public' && req.files && req.files.length > PUBLIC_MAX_FILES) {
        return sendError(res, 413, 'too_many_files', 'Too many files were uploaded in one request.', {
          hint: 'Reduce the number of files to 10 or fewer.',
        });
      }
      next();
    },
    checkToolsDailyLimit,
    wrapAsync(async (req, res) => {
      const action = (req.body?.action || '').toString().toLowerCase();
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
        if (!tools.length) {
          hadError = true;
          errorCode = 'invalid_parameter';
          errorMessage = 'At least one tool is required.';
          return sendError(res, 400, 'invalid_parameter', 'At least one tool is required.', {
            hint: 'Specify tools using tools or tools[].',
          });
        }
        if (action === 'single' && tools.length !== 1) {
          hadError = true;
          errorCode = 'invalid_parameter';
          errorMessage = 'Exactly one tool is required for action=single.';
          return sendError(res, 400, 'invalid_parameter', 'Exactly one tool is required for action=single.', {
            hint: 'Provide a single tool value when using action=single.',
          });
        }
        const includeRawExif = req.body.includeRawExif === 'true';
        toolsUsed = tools;
        includeRawExifUsed = req.body?.includeRawExif || null;
        const paletteSize = req.body.paletteSize ? parseInt(req.body.paletteSize, 10) : 5;
        const paletteSizeClamped = clampInt(paletteSize, 1, 16, 5);
        const hashType = (req.body.hashType || 'phash').toLowerCase();
        const qualitySample = clampInt(req.body.qualitySample, 64, 512, 256);
        const transparencySample = clampInt(req.body.transparencySample, 16, 128, 64);
        const similarityMode =
          (req.body.similarityMode || '').toLowerCase() === 'tofirst' ? 'tofirst' : 'pairs';
        const similarityThreshold = clampInt(req.body.similarityThreshold, 0, 64, 8);
        const efficiencyFormat = req.body.efficiencyFormat || null;
        const efficiencyQuality = req.body.efficiencyQuality || null;
        const results = [];
        const similarityHashes = [];

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
            toolsResult.colors = await getPalette(file.buffer, paletteSizeClamped);
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
            } else if (hashType === 'sha256') {
              hashValue = computeHash(file.buffer, 'sha256');
              hashUsed = 'sha256';
            } else {
              hashValue = await computePhash(file.buffer);
              hashUsed = 'phash';
            }
            toolsResult.hash = {
              hashType: hashUsed,
              hash: hashValue,
            };
          }
          if (tools.includes('similarity')) {
            similarityHashes.push(await computePhash(file.buffer));
          }

          if (tools.includes('dimensions')) {
            const aspectRatio = meta.width && meta.height ? Number((meta.width / meta.height).toFixed(4)) : null;
            let orientationClass = 'square';
            if (meta.width && meta.height) {
              if (Math.abs(meta.width - meta.height) <= 2) orientationClass = 'square';
              else if (meta.width > meta.height) orientationClass = 'landscape';
              else orientationClass = 'portrait';
            }
            toolsResult.dimensions = {
              width: meta.width || null,
              height: meta.height || null,
              aspectRatio,
              orientationClass,
            };
          }

          if (tools.includes('palette')) {
            const palette = await getPalette(file.buffer, paletteSizeClamped);
            const toObj = hex => {
              const h = (hex || '').replace('#', '');
              if (h.length === 6) {
                const r = parseInt(h.slice(0, 2), 16);
                const g = parseInt(h.slice(2, 4), 16);
                const b = parseInt(h.slice(4, 6), 16);
                return { r, g, b, hex: `#${h}` };
              }
              return { r: null, g: null, b: null, hex };
            };
            toolsResult.palette = {
              dominant: palette.dominant ? toObj(palette.dominant) : null,
              palette: (palette.palette || []).map(toObj),
            };
          }

          if (tools.includes('transparency')) {
            if (meta.hasAlpha) {
              const t = await estimateTransparency(file.buffer, transparencySample);
              toolsResult.transparency = {
                hasAlpha: true,
                ratioTransparent: t.ratioTransparent,
              };
            } else {
              toolsResult.transparency = {
                hasAlpha: false,
                ratioTransparent: 0,
              };
            }
          }

          if (tools.includes('quality')) {
            const q = await computeQualityScore(file.buffer, qualitySample);
            toolsResult.quality = {
              score: q.score,
              sharpness: q.sharpness,
              notes: 'higher is sharper',
            };
          }

          if (tools.includes('efficiency')) {
            const eff = await estimateEfficiency(file.buffer, efficiencyFormat, efficiencyQuality);
            toolsResult.efficiency = eff;
          }

          const entry = {
            originalName: file.originalname || null,
            tools: toolsResult,
          };

          results.push(entry);
        }

        if (tools.includes('similarity')) {
          if (similarityMode === 'pairs' && files.length > 25) {
            return sendError(res, 400, 'invalid_parameter', 'similarity pairs mode supports up to 25 images.', {
              hint: 'Reduce files or use similarityMode=toFirst.',
            });
          }
          if (similarityHashes.length === 0) {
            for (const file of files) {
              similarityHashes.push(await computePhash(file.buffer));
            }
          }
        }

        const response = { results };
        if (tools.includes('similarity')) {
          const sim = [];
          if (similarityMode === 'pairs') {
            for (let i = 0; i < similarityHashes.length; i++) {
              for (let j = i + 1; j < similarityHashes.length; j++) {
                const dist = hammingDistanceHex(similarityHashes[i], similarityHashes[j]);
                sim.push({
                  aIndex: i,
                  bIndex: j,
                  distance: dist,
                  isSimilar: dist !== null ? dist <= similarityThreshold : false,
                });
              }
            }
          } else {
            for (let i = 1; i < similarityHashes.length; i++) {
              const dist = hammingDistanceHex(similarityHashes[0], similarityHashes[i]);
              sim.push({
                index: i,
                distance: dist,
                isSimilar: dist !== null ? dist <= similarityThreshold : false,
              });
            }
          }
          response.batch = { similarity: sim };
        }

        res.json(response);
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
    })
  );
};
