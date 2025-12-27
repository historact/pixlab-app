const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { sendError } = require('../utils/errorResponse');
const {
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  recordUsageAndLog,
  getUsagePeriodForKey,
} = require('../usage');
const { extractClientInfo } = require('../utils/requestInfo');
const { wrapAsync } = require('../utils/wrapAsync');

const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES, 10) || 10 * 1024 * 1024;
const MAX_FILES_PER_REQ = parseInt(process.env.MAX_FILES_PER_REQ, 10) || 10;

const allowedImageMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

const upload = multer({
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: MAX_FILES_PER_REQ + 1, // allow optional watermarkImage without affecting images quota
  },
});

function parseDailyLimitEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MAX_FILES = 50;
const PUBLIC_MAX_FILES = 10;
const PUBLIC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const PUBLIC_MAX_DIMENSION = 6000;

// Per-IP per-day store for /v1/image (public keys only)
const imageFileRateStore = new Map();
const IMAGE_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_IMAGE_DAILY_LIMIT', 10);

function getIp(req) {
  const { ip } = extractClientInfo(req);
  return ip || 'unknown';
}

function checkImageDailyLimit(req, res, next) {
  if (req.apiKeyType !== 'public') return next();

  const ip = getIp(req);
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const count = imageFileRateStore.get(key) || 0;
  const incoming = getImageFiles(req).length;
  if (count + incoming > IMAGE_DAILY_LIMIT) {
    return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
      hint: 'Try again tomorrow or contact support if you need higher limits.',
    });
  }

  imageFileRateStore.set(key, count + incoming);
  next();
}

function parseBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return false;
}

function normalizeFormat(fmt) {
  if (!fmt) return null;
  const f = fmt.toLowerCase();
  if (f === 'jpg') return 'jpeg';
  return f;
}

function getPageSize(name, orientation) {
  const sizes = {
    a4: [595.28, 841.89],
    letter: [612, 792],
  };
  const key = name ? name.toLowerCase() : 'auto';
  let size = sizes[key] || null;
  if (size && orientation === 'landscape') {
    size = [size[1], size[0]];
  }
  return size;
}

function clampInt(val, min, max, fallback) {
  const num = parseInt(val, 10);
  if (Number.isFinite(num) && num >= min && num <= max) return num;
  return fallback;
}

function normalizePdfEmbedFormat(val) {
  const fmt = (val || '').toString().toLowerCase();
  if (fmt === 'jpeg' || fmt === 'jpg') return 'jpeg';
  if (fmt === 'png') return 'png';
  return 'png';
}

function isSvg(file) {
  if (!file) return false;
  if (file.mimetype === 'image/svg+xml') return true;
  if (file.originalname && file.originalname.toLowerCase().endsWith('.svg')) return true;
  return false;
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

function parsePosition(pos) {
  const allowed = new Set([
    'center',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'top',
    'bottom',
    'left',
    'right',
  ]);
  const normalized = (pos || '').toLowerCase();
  return allowed.has(normalized) ? normalized : 'center';
}

function applyPositioning({ baseWidth, baseHeight, overlayWidth, overlayHeight, position, margin }) {
  const pos = parsePosition(position);
  const m = Math.max(margin || 0, 0);
  let left = Math.round((baseWidth - overlayWidth) / 2);
  let top = Math.round((baseHeight - overlayHeight) / 2);

  if (pos === 'top-left') {
    left = m;
    top = m;
  } else if (pos === 'top-right') {
    left = baseWidth - overlayWidth - m;
    top = m;
  } else if (pos === 'bottom-left') {
    left = m;
    top = baseHeight - overlayHeight - m;
  } else if (pos === 'bottom-right') {
    left = baseWidth - overlayWidth - m;
    top = baseHeight - overlayHeight - m;
  } else if (pos === 'top') {
    top = m;
  } else if (pos === 'bottom') {
    top = baseHeight - overlayHeight - m;
  } else if (pos === 'left') {
    left = m;
  } else if (pos === 'right') {
    left = baseWidth - overlayWidth - m;
  }

  return { left, top };
}

function hexToRgb(color, fallback = { r: 255, g: 255, b: 255 }) {
  if (!color || typeof color !== 'string') return fallback;
  const hex = color.replace('#', '').trim();
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if ([r, g, b].every(Number.isFinite)) return { r, g, b };
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every(Number.isFinite)) return { r, g, b };
  }
  return fallback;
}

function buildTextWatermarkSvg({ text, width, height, fontSize, color, opacity }) {
  const safeText = text || '';
  const { r, g, b } = hexToRgb(color);
  const fill = `rgba(${r},${g},${b},${opacity})`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <style>
        .wm { font-size: ${fontSize}px; fill: ${fill}; font-family: Arial, sans-serif; }
      </style>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="wm">${safeText}</text>
    </svg>`
  );
}

function getImageFiles(req) {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  return req.files.images || [];
}

function getWatermarkFile(req) {
  if (!req.files) return null;
  if (Array.isArray(req.files)) return null;
  const arr = req.files.watermarkImage || [];
  return arr[0] || null;
}

async function toPdfEmbeddableBuffer({ buffer, embedFormat, jpegQuality, isSvgInput }) {
  const normalizedFormat = normalizePdfEmbedFormat(embedFormat);
  const quality = clampInt(jpegQuality, 20, 100, 85);
  const sharpOptions = isSvgInput ? { limitInputPixels: 268402689 } : {};
  const instance = sharp(buffer, sharpOptions);
  const outBuffer =
    normalizedFormat === 'jpeg'
      ? await instance.jpeg({ quality }).toBuffer()
      : await instance.png({ compressionLevel: 9 }).toBuffer();
  return { buffer: outBuffer, embedFormat: normalizedFormat };
}

async function generateSinglePdf({ imageBuffer, width, height, format, pdfOptions, isSvgInput }) {
  const pdfDoc = await PDFDocument.create();
  const { buffer: embedBuffer, embedFormat } = await toPdfEmbeddableBuffer({
    buffer: imageBuffer,
    embedFormat: pdfOptions.pdfEmbedFormat,
    jpegQuality: pdfOptions.pdfJpegQuality,
    isSvgInput,
  });
  const meta = await sharp(embedBuffer).metadata();
  const pageWidth = meta.width || width;
  const pageHeight = meta.height || height;
  const pageSize =
    pdfOptions.pdfPageSize === 'auto'
      ? [pageWidth, pageHeight]
      : getPageSize(pdfOptions.pdfPageSize, pdfOptions.pdfOrientation) || [pageWidth, pageHeight];

  const page = pdfDoc.addPage(pageSize);
  const margin = pdfOptions.pdfMargin || 0;
  const embedOpts = {};
  let embedded;
  if (embedFormat === 'jpeg') {
    embedded = await pdfDoc.embedJpg(embedBuffer, embedOpts);
  } else {
    embedded = await pdfDoc.embedPng(embedBuffer, embedOpts);
  }

  const usableWidth = pageSize[0] - margin * 2;
  const usableHeight = pageSize[1] - margin * 2;
  const scale = Math.min(usableWidth / embedded.width, usableHeight / embedded.height, 1);
  const drawWidth = embedded.width * scale;
  const drawHeight = embedded.height * scale;
  const x = (pageSize[0] - drawWidth) / 2;
  const y = (pageSize[1] - drawHeight) / 2;
  page.drawImage(embedded, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

function validateFilesOrFail(files, res) {
  if (!Array.isArray(files)) return true;
  for (const file of files) {
    if (!allowedImageMimes.has(file.mimetype)) {
      sendError(res, 415, 'unsupported_media_type', 'Unsupported file type uploaded.', {
        hint: 'Allowed types: jpeg, png, webp, gif, avif, svg.',
      });
      return false;
    }
  }
  return true;
}

function handleMulter(middleware) {
  return (req, res, next) => {
    middleware(req, res, err => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return sendError(res, 413, 'file_too_large', 'Uploaded file exceeds size limit.', {
            hint: `Max size: ${MAX_UPLOAD_BYTES} bytes per file.`,
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return sendError(res, 413, 'too_many_files', 'Too many files were uploaded.', {
            hint: `Max files per request: ${MAX_FILES_PER_REQ}.`,
          });
        }
        return sendError(res, 400, 'invalid_upload', 'Upload failed validation.', {
          details: err.message,
        });
      }
      next();
    });
  };
}

module.exports = function (app, { checkApiKey, imgEditDir, baseUrl, publicTimeoutMiddleware }) {
  app.post(
    '/v1/image',
    checkApiKey,
    publicTimeoutMiddleware,
    handleMulter(
      upload.fields([
        { name: 'images', maxCount: MAX_FILES },
        { name: 'watermarkImage', maxCount: 1 },
      ])
    ),
    (req, res, next) => {
      const imageFiles = getImageFiles(req);
      if (req.apiKeyType === 'public' && imageFiles && imageFiles.length > PUBLIC_MAX_FILES) {
        return sendError(res, 413, 'too_many_files', 'Too many files were uploaded in one request.', {
          hint: 'Reduce the number of files to 10 or fewer.',
        });
      }
      if (!validateFilesOrFail(imageFiles, res)) return;
      next();
    },
    checkImageDailyLimit,
    wrapAsync(async (req, res) => {
      const isCustomer = req.apiKeyType === 'customer';
      const { ip, userAgent } = extractClientInfo(req);
      const files = getImageFiles(req);
      const watermarkImageFile = getWatermarkFile(req);
      const filesToConsume = Math.max(files.length, 1);
      const bytesIn = files.reduce((sum, f) => sum + (f.size || f.buffer?.length || 0), 0);
      let bytesOut = 0;
      let hadError = false;
      let errorCode = null;
      let errorMessage = null;
      let usageRecord = null;
      let formatUsed = null;
      let widthUsed = null;
      let heightUsed = null;
      let pdfModeUsed = null;

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
          const totalSize = files.reduce((sum, f) => sum + f.size, 0);
          if (totalSize > PUBLIC_MAX_BYTES) {
            hadError = true;
            errorCode = 'payload_too_large';
            errorMessage = 'The uploaded files are too large.';
            return sendError(res, 413, 'payload_too_large', 'The uploaded files are too large.', {
              hint: 'Reduce total upload size to 10 MB or less.',
            });
          }
        }

        const {
      format,
      width,
      height,
      enlarge,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      rotate,
      flipH,
      flipV,
      targetSizeKB,
      quality,
      keepMetadata,
      pdfMode,
      pdfPageSize,
      pdfOrientation,
      pdfMargin,
      normalizeOrientation,
      blur,
      sharpen,
      grayscale: grayscaleParam,
      sepia,
      brightness,
      contrast,
      saturation,
      pad,
      padTop,
      padRight,
      padBottom,
      padLeft,
      padColor,
      border,
      borderColor,
      borderRadius,
      backgroundColor,
      backgroundBlur,
      watermarkText,
      watermarkFontSize,
      watermarkColor,
      watermarkOpacity,
      watermarkPosition,
      watermarkMargin,
      watermarkScale,
      colorSpace,
    } = req.body;

        formatUsed = format || null;
        widthUsed = width || null;
        heightUsed = height || null;
        pdfModeUsed = pdfMode || null;

        const finalFormat = normalizeFormat(format);
        const parsedWidth = width ? parseInt(width, 10) : null;
        const parsedHeight = height ? parseInt(height, 10) : null;
        const parsedTargetSize = targetSizeKB ? parseInt(targetSizeKB, 10) : null;
        const parsedQuality = quality ? parseInt(quality, 10) : null;
        const allowEnlarge = parseBoolean(enlarge);
        const doFlipH = parseBoolean(flipH);
        const doFlipV = parseBoolean(flipV);
        const preserveMetadata = parseBoolean(keepMetadata);
        const colorSpaceValue = (colorSpace || 'srgb').toLowerCase();

        const pdfOptions = {
          pdfMode: pdfMode === 'multi' ? 'multi' : 'single',
          pdfPageSize: pdfPageSize || 'auto',
          pdfOrientation: pdfOrientation === 'landscape' ? 'landscape' : 'portrait',
          pdfMargin: pdfMargin ? parseInt(pdfMargin, 10) : 0,
          pdfEmbedFormat: normalizePdfEmbedFormat(req.body.pdfEmbedFormat),
          pdfJpegQuality: clampInt(req.body.pdfJpegQuality, 20, 100, 85),
        };

        const results = [];

        const processImageBuffer = async (file) => {
          const svgInput = isSvg(file);
          let pipeline = sharp(file.buffer, svgInput ? { limitInputPixels: 268402689 } : {});
          let meta = await pipeline.metadata();

          if (parseBoolean(normalizeOrientation) && meta.orientation) {
            pipeline = pipeline.rotate();
            meta = await pipeline.metadata();
          }

          // Enforce dimension limit for public keys
          if (req.apiKeyType === 'public' && meta.width && meta.height) {
            if (meta.width > PUBLIC_MAX_DIMENSION || meta.height > PUBLIC_MAX_DIMENSION) {
              const scale = Math.min(
                PUBLIC_MAX_DIMENSION / meta.width,
                PUBLIC_MAX_DIMENSION / meta.height
              );
              pipeline = pipeline.resize({
                width: Math.round(meta.width * scale),
                height: Math.round(meta.height * scale),
                fit: 'inside',
                withoutEnlargement: true,
              });
              meta = await pipeline.metadata();
            }
          }

          if (
            cropX !== undefined &&
            cropY !== undefined &&
            cropWidth !== undefined &&
            cropHeight !== undefined
          ) {
            const cx = parseInt(cropX, 10);
            const cy = parseInt(cropY, 10);
            const cw = parseInt(cropWidth, 10);
            const ch = parseInt(cropHeight, 10);
            if ([cx, cy, cw, ch].every(Number.isFinite)) {
              pipeline = pipeline.extract({ left: cx, top: cy, width: cw, height: ch });
            }
          }

          if (parsedWidth || parsedHeight) {
            pipeline = pipeline.resize(parsedWidth || null, parsedHeight || null, {
              fit: 'inside',
              withoutEnlargement: !allowEnlarge,
            });
          }

          if (rotate) {
            const angle = parseInt(rotate, 10);
            if (Number.isFinite(angle)) pipeline = pipeline.rotate(angle);
          }
          if (doFlipH) pipeline = pipeline.flip();
          if (doFlipV) pipeline = pipeline.flop();

          if (blur) {
            const blurAmount = clampNumber(blur, 0, 500, null);
            if (blurAmount !== null && blurAmount !== undefined) {
              pipeline = blurAmount === 0 ? pipeline.blur() : pipeline.blur(blurAmount);
            }
          }
          if (sharpen) {
            const sharpenAmount = clampNumber(sharpen, 0, 10, parseBoolean(sharpen) ? 1 : null);
            if (sharpenAmount !== null && sharpenAmount !== undefined) {
              pipeline = sharpenAmount ? pipeline.sharpen(sharpenAmount) : pipeline.sharpen();
            }
          }
          if (parseBoolean(grayscaleParam)) pipeline = pipeline.grayscale();
          if (parseBoolean(sepia)) {
            pipeline = pipeline.recomb([
              [0.393, 0.769, 0.189],
              [0.349, 0.686, 0.168],
              [0.272, 0.534, 0.131],
            ]);
          }
          const brightnessValue = clampNumber(brightness, 0, 2, 1);
          const saturationValue = clampNumber(saturation, 0, 2, 1);
          const contrastValue = clampNumber(contrast, 0, 2, 1);
          const needsModulate = brightnessValue !== 1 || saturationValue !== 1;
          if (needsModulate) {
            pipeline = pipeline.modulate({
              brightness: brightnessValue,
              saturation: saturationValue,
            });
          }
          if (contrastValue !== 1) {
            const c = contrastValue;
            pipeline = pipeline.linear(c, 128 * (1 - c));
          }

          let workingBuffer = await pipeline.toBuffer();
          let workingMeta = await sharp(workingBuffer).metadata();

          // Background replacement / flattening
          if (
            (workingMeta.hasAlpha && (backgroundColor || backgroundBlur)) ||
            (!workingMeta.hasAlpha && (finalFormat === 'jpeg' || finalFormat === 'jpg'))
          ) {
            if (backgroundBlur) {
              const blurVal = clampNumber(backgroundBlur, 0, 200, null) || 20;
              const blurred = await sharp(workingBuffer).blur(blurVal).toBuffer();
              workingBuffer = await sharp(blurred)
                .composite([{ input: workingBuffer }])
                .toBuffer();
            } else if (backgroundColor) {
              workingBuffer = await sharp(workingBuffer).flatten({ background: backgroundColor }).toBuffer();
            }
            workingMeta = await sharp(workingBuffer).metadata();
          }

          // Padding
          const padValue = pad !== undefined ? parseInt(pad, 10) : null;
          const padValues = {
            top: padValue !== null ? padValue : padTop ? parseInt(padTop, 10) : 0,
            right: padValue !== null ? padValue : padRight ? parseInt(padRight, 10) : 0,
            bottom: padValue !== null ? padValue : padBottom ? parseInt(padBottom, 10) : 0,
            left: padValue !== null ? padValue : padLeft ? parseInt(padLeft, 10) : 0,
          };
          if (Object.values(padValues).some(v => Number.isFinite(v) && v > 0)) {
            const extendOpts = {
              top: Math.max(padValues.top || 0, 0),
              right: Math.max(padValues.right || 0, 0),
              bottom: Math.max(padValues.bottom || 0, 0),
              left: Math.max(padValues.left || 0, 0),
              background: padColor || '#ffffff',
            };
            workingBuffer = await sharp(workingBuffer).extend(extendOpts).toBuffer();
            workingMeta = await sharp(workingBuffer).metadata();
          }

          // Border
          const borderValue = border ? Math.max(parseInt(border, 10), 0) : 0;
          if (borderValue > 0) {
            workingBuffer = await sharp(workingBuffer)
              .extend({
                top: borderValue,
                right: borderValue,
                bottom: borderValue,
                left: borderValue,
                background: borderColor || '#000000',
              })
              .toBuffer();
            workingMeta = await sharp(workingBuffer).metadata();
          }

          // Border radius
          const borderRadiusValue = borderRadius ? Math.max(parseInt(borderRadius, 10), 0) : 0;
          if (borderRadiusValue > 0 && workingMeta.width && workingMeta.height) {
            const maskSvg = Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${workingMeta.width}" height="${workingMeta.height}">
                <rect x="0" y="0" width="${workingMeta.width}" height="${workingMeta.height}" rx="${borderRadiusValue}" ry="${borderRadiusValue}" fill="white"/>
              </svg>`
            );
            workingBuffer = await sharp(workingBuffer)
              .ensureAlpha()
              .composite([{ input: maskSvg, blend: 'dest-in' }])
              .toBuffer();
            workingMeta = await sharp(workingBuffer).metadata();
            const outFmt = finalFormat || workingMeta.format || 'jpeg';
            if (['jpeg', 'jpg'].includes(outFmt)) {
              workingBuffer = await sharp(workingBuffer)
                .flatten({ background: padColor || borderColor || '#ffffff' })
                .toBuffer();
              workingMeta = await sharp(workingBuffer).metadata();
            }
          }

          // Watermark image
          if (watermarkImageFile && watermarkImageFile.buffer && workingMeta.width && workingMeta.height) {
            try {
              const wmBase = sharp(watermarkImageFile.buffer);
              const wmMeta = await wmBase.metadata();
              const scaleBase = Math.min(workingMeta.width, workingMeta.height);
              const targetSize = Math.max(Math.round(scaleBase * clampNumber(watermarkScale, 0.01, 1, 0.25)), 1);
              const resizedWm = await wmBase
                .resize({ width: targetSize, height: targetSize, fit: 'inside', withoutEnlargement: true })
                .toBuffer();
              const resizedMeta = await sharp(resizedWm).metadata();
              const pos = applyPositioning({
                baseWidth: workingMeta.width,
                baseHeight: workingMeta.height,
                overlayWidth: resizedMeta.width,
                overlayHeight: resizedMeta.height,
                position: watermarkPosition || 'center',
                margin: clampInt(watermarkMargin, 0, 5000, 24),
              });
              workingBuffer = await sharp(workingBuffer)
                .composite([
                  {
                    input: resizedWm,
                    top: pos.top,
                    left: pos.left,
                    blend: 'over',
                    opacity: clampNumber(watermarkOpacity, 0, 1, 0.35),
                  },
                ])
                .toBuffer();
              workingMeta = await sharp(workingBuffer).metadata();
            } catch (e) {
              // ignore watermark failures to avoid breaking core processing
            }
          }

          // Watermark text
          if (watermarkText && workingMeta.width && workingMeta.height) {
            const fontSizeVal = clampInt(watermarkFontSize, 6, 400, 32);
            const approxWidth = Math.min(
              workingMeta.width,
              Math.max(Math.round(fontSizeVal * (watermarkText.length || 1) * 0.6), 10)
            );
            const approxHeight = Math.max(Math.round(fontSizeVal * 1.2), 10);
            const svg = buildTextWatermarkSvg({
              text: watermarkText,
              width: approxWidth,
              height: approxHeight,
              fontSize: fontSizeVal,
              color: watermarkColor || '#ffffff',
              opacity: clampNumber(watermarkOpacity, 0, 1, 0.35),
            });
            const pos = applyPositioning({
              baseWidth: workingMeta.width,
              baseHeight: workingMeta.height,
              overlayWidth: approxWidth,
              overlayHeight: approxHeight,
              position: watermarkPosition || 'center',
              margin: clampInt(watermarkMargin, 0, 5000, 24),
            });
            workingBuffer = await sharp(workingBuffer)
              .composite([
                {
                  input: svg,
                  top: pos.top,
                  left: pos.left,
                  blend: 'over',
                },
              ])
              .toBuffer();
            workingMeta = await sharp(workingBuffer).metadata();
          }

          const detectedFormat = (meta.format || 'jpeg').toLowerCase();
          const outputFormat = finalFormat || detectedFormat || 'jpeg';

          const extMap = {
            jpeg: 'jpg',
            jpg: 'jpg',
            png: 'png',
            webp: 'webp',
            avif: 'avif',
            gif: 'gif',
            svg: 'svg',
            pdf: 'pdf',
          };

          const encodeWithQuality = async (q) => {
            let instance = sharp(workingBuffer);
            try {
              if (colorSpaceValue === 'grayscale' || parseBoolean(grayscaleParam)) {
                instance = instance.toColourspace('b-w');
              } else if (colorSpaceValue === 'srgb' || !colorSpaceValue) {
                instance = instance.toColourspace('srgb');
              } else if (colorSpaceValue === 'cmyk') {
                instance = instance.toColourspace('cmyk');
              }
            } catch (err) {
              const e = new Error('cmyk_not_supported');
              e.code = 'cmyk_not_supported';
              throw e;
            }
            if (preserveMetadata) instance = instance.withMetadata();
            switch (outputFormat) {
              case 'png':
                instance = instance.png({ compressionLevel: 9 });
                break;
              case 'webp':
                instance = instance.webp(q ? { quality: q } : {});
                break;
              case 'avif':
                instance = instance.avif(q ? { quality: q } : {});
                break;
              case 'gif':
                instance = instance.gif();
                break;
              case 'svg':
                instance = instance.svg();
                break;
              case 'pdf':
                break;
              case 'jpeg':
              case 'jpg':
              default:
                instance = instance.jpeg(q ? { quality: q } : {});
                break;
            }
            return instance.toBuffer();
          };

          let outputBuffer;
          let qualityUsed = null;
          let finalBufferFormat = outputFormat;
          let finalMeta;

          if (outputFormat === 'pdf') {
            const intermediate = await encodeWithQuality(parsedQuality || null);
            finalBufferFormat = 'png';
            finalMeta = await sharp(intermediate).metadata();
            return { buffer: intermediate, format: finalBufferFormat, meta: finalMeta, qualityUsed, isSvg: svgInput, extMap };
          }

          const targetBytes = parsedTargetSize ? parsedTargetSize * 1024 : null;
          if (targetBytes) {
            let low = 20;
            let high = 90;
            let bestBuffer = null;
            let bestQuality = null;
            for (let i = 0; i < 7; i++) {
              const mid = Math.round((low + high) / 2);
              const testBuffer = await encodeWithQuality(mid);
              if (testBuffer.length > targetBytes) {
                high = mid - 5;
              } else {
                bestBuffer = testBuffer;
                bestQuality = mid;
                low = mid + 5;
              }
            }
            if (bestBuffer) {
              outputBuffer = bestBuffer;
              qualityUsed = bestQuality;
            } else {
              outputBuffer = await encodeWithQuality(parsedQuality || null);
              qualityUsed = parsedQuality || null;
            }
          } else if (parsedQuality || finalFormat) {
            qualityUsed = parsedQuality || null;
            outputBuffer = await encodeWithQuality(parsedQuality || null);
          } else {
            outputBuffer = await encodeWithQuality(null);
          }

          finalMeta = await sharp(outputBuffer).metadata();
          return {
            buffer: outputBuffer,
            format: outputFormat,
            meta: finalMeta,
            qualityUsed,
            isSvg: svgInput,
            extMap,
          };
        };

        // Preprocess all images
        const processed = [];
        for (const file of files) {
          processed.push(await processImageBuffer(file));
        }

        // If PDF multi-page mode
        if (finalFormat === 'pdf' && pdfOptions.pdfMode === 'multi') {
          const pdfDoc = await PDFDocument.create();
          for (const item of processed) {
            const { buffer: embedBuffer, embedFormat } = await toPdfEmbeddableBuffer({
              buffer: item.buffer,
              embedFormat: pdfOptions.pdfEmbedFormat,
              jpegQuality: pdfOptions.pdfJpegQuality,
              isSvgInput: item.isSvg,
            });
            const meta = await sharp(embedBuffer).metadata();
            const pageWidth = meta.width || item.meta.width;
            const pageHeight = meta.height || item.meta.height;
            const pageSize = pdfOptions.pdfPageSize === 'auto'
              ? [pageWidth, pageHeight]
              : getPageSize(pdfOptions.pdfPageSize, pdfOptions.pdfOrientation) || [pageWidth, pageHeight];
            const page = pdfDoc.addPage(pageSize);
            const margin = pdfOptions.pdfMargin || 0;
            const embed =
              embedFormat === 'jpeg'
                ? await pdfDoc.embedJpg(embedBuffer)
                : await pdfDoc.embedPng(embedBuffer);
            const usableWidth = pageSize[0] - margin * 2;
            const usableHeight = pageSize[1] - margin * 2;
            const scale = Math.min(
              usableWidth / embed.width,
              usableHeight / embed.height,
              1
            );
            const drawWidth = embed.width * scale;
            const drawHeight = embed.height * scale;
            const x = (pageSize[0] - drawWidth) / 2;
            const y = (pageSize[1] - drawHeight) / 2;
            page.drawImage(embed, { x, y, width: drawWidth, height: drawHeight });
          }
          const pdfBytes = await pdfDoc.save();
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(imgEditDir, fileName);
          await sharp(Buffer.from(pdfBytes)).toFile(filePath).catch(async () => {
            // fallback to fs write if sharp cannot write PDF
            await fs.promises.writeFile(filePath, Buffer.from(pdfBytes));
          });
          results.push({
            url: `${baseUrl}/img-edit/${fileName}`,
            format: 'pdf',
            sizeBytes: pdfBytes.length,
            width: null,
            height: null,
            quality: null,
            originalName: null,
          });
        } else {
          for (let i = 0; i < processed.length; i++) {
            const item = processed[i];
            if (finalFormat === 'pdf') {
              const pdfBytes = await generateSinglePdf({
                imageBuffer: item.buffer,
                width: item.meta.width,
                height: item.meta.height,
                format: item.format,
                pdfOptions,
                isSvgInput: item.isSvg,
              });
              const fileName = `${uuidv4()}.pdf`;
              const filePath = path.join(imgEditDir, fileName);
              await sharp(Buffer.from(pdfBytes)).toFile(filePath).catch(async () => {
                await fs.promises.writeFile(filePath, Buffer.from(pdfBytes));
              });
              results.push({
                url: `${baseUrl}/img-edit/${fileName}`,
                format: 'pdf',
                sizeBytes: pdfBytes.length,
                width: null,
                height: null,
                quality: null,
                originalName: files[i].originalname || null,
              });
            } else {
              const extMap = {
                jpeg: 'jpg',
                jpg: 'jpg',
                png: 'png',
                webp: 'webp',
                avif: 'avif',
                gif: 'gif',
                svg: 'svg',
              };
              const ext = extMap[item.format] || 'jpg';
              const fileName = `${uuidv4()}.${ext}`;
              const filePath = path.join(imgEditDir, fileName);
              await sharp(item.buffer).toFile(filePath);
              results.push({
                url: `${baseUrl}/img-edit/${fileName}`,
                format: item.format,
                sizeBytes: item.buffer.length,
                width: item.meta.width || null,
                height: item.meta.height || null,
                quality: item.qualityUsed,
                originalName: files[i].originalname || null,
              });
            }
          }
        }

        bytesOut = results.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);

        res.json({ results });
      } catch (err) {
        hadError = true;
        if (err && err.code === 'cmyk_not_supported') {
          errorCode = 'invalid_parameter';
          errorMessage = 'CMYK not supported in this build.';
          sendError(res, 400, 'invalid_parameter', 'CMYK not supported in this build.', {
            hint: 'Use colorSpace=srgb or colorSpace=grayscale.',
          });
        } else {
          errorCode = 'image_processing_failed';
          errorMessage = 'Failed to process the image.';
          console.error(err);
          sendError(res, 500, 'image_processing_failed', 'Failed to process the image.', {
            hint: 'Verify that the uploaded file is a supported image format.',
            details: err,
          });
        }
      } finally {
        if (isCustomer && req.customerKey) {
          await recordUsageAndLog({
            apiKeyRecord: req.customerKey,
            endpoint: 'image',
            action: 'image_edit',
            filesProcessed: hadError ? 0 : filesToConsume,
            bytesIn,
            bytesOut,
            status: res.statusCode || (hadError ? 500 : 200),
            ip,
            userAgent,
            ok: !hadError,
            errorCode: hadError ? errorCode : null,
            errorMessage: hadError ? errorMessage : null,
            paramsForLog: {
              format: formatUsed,
              width: widthUsed,
              height: heightUsed,
              pdfMode: pdfModeUsed,
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
