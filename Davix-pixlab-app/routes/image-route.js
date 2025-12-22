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
    files: MAX_FILES_PER_REQ,
  },
});

const MAX_FILES = 50;
const PUBLIC_MAX_FILES = 10;
const PUBLIC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const PUBLIC_MAX_DIMENSION = 6000;

// Per-IP per-day store for /v1/image (public keys only)
const imageFileRateStore = new Map();
const IMAGE_DAILY_LIMIT = 10;

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
  const incoming = (req.files || []).length;
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
    handleMulter(upload.array('images', MAX_FILES)),
    (req, res, next) => {
      if (req.apiKeyType === 'public' && req.files && req.files.length > PUBLIC_MAX_FILES) {
        return sendError(res, 413, 'too_many_files', 'Too many files were uploaded in one request.', {
          hint: 'Reduce the number of files to 10 or fewer.',
        });
      }
      if (!validateFilesOrFail(req.files, res)) return;
      next();
    },
    checkImageDailyLimit,
    wrapAsync(async (req, res) => {
      const isCustomer = req.apiKeyType === 'customer';
      const { ip, userAgent } = extractClientInfo(req);
      const files = req.files || [];
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
          const meta = await pipeline.metadata();

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
          if (preserveMetadata) pipeline = pipeline.withMetadata();

          const detectedFormat = (meta.format || 'jpeg').toLowerCase();
          const outputFormat = finalFormat || detectedFormat || 'jpeg';

          const applyFormat = (instance, q) => {
            const qOpt = q ? { quality: q } : {};
            switch (outputFormat) {
              case 'png':
                return instance.png({ compressionLevel: 9 });
              case 'webp':
                return instance.webp(qOpt);
              case 'avif':
                return instance.avif(qOpt);
              case 'gif':
                return instance.gif();
              case 'svg':
                return instance.svg();
              case 'pdf':
                return instance;
              case 'jpeg':
              case 'jpg':
              default:
                return instance.jpeg(qOpt);
            }
          };

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

          let outputBuffer;
          let qualityUsed = null;
          let finalBufferFormat = outputFormat;
          let finalMeta;

          if (outputFormat === 'pdf') {
            // We return the processed image buffer to be embedded later
            const intermediate = await applyFormat(pipeline.clone(), parsedQuality || null).toBuffer();
            finalBufferFormat = 'png';
            finalMeta = await sharp(intermediate).metadata();
            return { buffer: intermediate, format: finalBufferFormat, meta: finalMeta, qualityUsed, isSvg: svgInput };
          }

          const targetBytes = parsedTargetSize ? parsedTargetSize * 1024 : null;
          if (targetBytes) {
            let low = 20;
            let high = 90;
            let bestBuffer = null;
            let bestQuality = null;
            for (let i = 0; i < 7; i++) {
              const mid = Math.round((low + high) / 2);
              const testBuffer = await applyFormat(pipeline.clone(), mid).toBuffer();
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
              outputBuffer = await applyFormat(pipeline.clone(), parsedQuality || null).toBuffer();
              qualityUsed = parsedQuality || null;
            }
          } else if (parsedQuality || finalFormat) {
            qualityUsed = parsedQuality || null;
            outputBuffer = await applyFormat(pipeline, parsedQuality || null).toBuffer();
          } else {
            outputBuffer = await pipeline.toBuffer();
          }

          finalMeta = await sharp(outputBuffer).metadata();
          return {
            buffer: outputBuffer,
            format: outputFormat,
            meta: finalMeta,
            qualityUsed,
            isSvg: svgInput,
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
        errorCode = 'image_processing_failed';
            errorMessage = 'Failed to process the image.';
        console.error(err);
        sendError(res, 500, 'image_processing_failed', 'Failed to process the image.', {
          hint: 'Verify that the uploaded file is a supported image format.',
          details: err,
        });
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
