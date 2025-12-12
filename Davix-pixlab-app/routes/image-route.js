const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { sendError } = require('../utils/errorResponse');

const upload = multer();

const MAX_FILES = 50;
const PUBLIC_MAX_FILES = 10;
const PUBLIC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const PUBLIC_MAX_DIMENSION = 6000;

// Per-IP per-day store for /v1/image (public keys only)
const imageFileRateStore = new Map();
const IMAGE_DAILY_LIMIT = 10;

function getIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
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

async function generateSinglePdf({ imageBuffer, width, height, format, pdfOptions }) {
  const pdfDoc = await PDFDocument.create();
  const pageSize =
    pdfOptions.pdfPageSize === 'auto'
      ? [width, height]
      : getPageSize(pdfOptions.pdfPageSize, pdfOptions.pdfOrientation) || [width, height];

  const page = pdfDoc.addPage(pageSize);
  const margin = pdfOptions.pdfMargin || 0;
  const embedOpts = {};
  let embedded;
  if (format === 'jpeg') {
    embedded = await pdfDoc.embedJpg(imageBuffer, embedOpts);
  } else {
    embedded = await pdfDoc.embedPng(imageBuffer, embedOpts);
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

module.exports = function (app, { checkApiKey, imgEditDir, baseUrl, publicTimeoutMiddleware }) {
  app.post(
    '/v1/image',
    checkApiKey,
    publicTimeoutMiddleware,
    upload.array('images', MAX_FILES),
    (req, res, next) => {
      if (req.apiKeyType === 'public' && req.files && req.files.length > PUBLIC_MAX_FILES) {
        return sendError(res, 413, 'too_many_files', 'Too many files were uploaded in one request.', {
          hint: 'Reduce the number of files to 10 or fewer.',
        });
      }
      next();
    },
    checkImageDailyLimit,
    async (req, res) => {
      try {
        const files = req.files || [];
        if (!files.length) {
          return sendError(res, 400, 'missing_field', 'An image file is required.', {
            hint: "Upload at least one file in the 'images' field.",
          });
        }

        if (req.apiKeyType === 'public') {
          const totalSize = files.reduce((sum, f) => sum + f.size, 0);
          if (totalSize > PUBLIC_MAX_BYTES) {
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
        };

        const results = [];

        const processImageBuffer = async (file) => {
          let pipeline = sharp(file.buffer);
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
            return { buffer: intermediate, format: finalBufferFormat, meta: finalMeta, qualityUsed };
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
            const pageSize = pdfOptions.pdfPageSize === 'auto'
              ? [item.meta.width, item.meta.height]
              : getPageSize(pdfOptions.pdfPageSize, pdfOptions.pdfOrientation) || [item.meta.width, item.meta.height];
            const page = pdfDoc.addPage(pageSize);
            const margin = pdfOptions.pdfMargin || 0;
            const embed = await pdfDoc.embedPng(item.buffer);
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

        res.json({ results });
      } catch (err) {
        console.error(err);
        sendError(res, 500, 'image_processing_failed', 'Failed to process the image.', {
          hint: 'Verify that the uploaded file is a supported image format.',
          details: err,
        });
      }
    }
  );
};
