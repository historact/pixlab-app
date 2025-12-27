const multer = require('multer');
const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');
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
const allowedPdfMimes = new Set(['application/pdf']);

const upload = multer({
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: MAX_FILES_PER_REQ,
  },
});

function parseDailyLimitEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const PUBLIC_MAX_FILES = 10;
const PUBLIC_MAX_BYTES = 10 * 1024 * 1024;
const pdfFileRateStore = new Map();
const PDF_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_PDF_DAILY_LIMIT', 10);

function getIp(req) {
  const { ip } = extractClientInfo(req);
  return ip || 'unknown';
}

function checkPdfDailyLimit(req, res, next) {
  if (req.apiKeyType !== 'public') return next();
  const ip = getIp(req);
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const incoming = getPdfFiles(req).length;
  const count = pdfFileRateStore.get(key) || 0;
  if (count + incoming > PDF_DAILY_LIMIT) {
    return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
      hint: 'Try again tomorrow or contact support if you need higher limits.',
    });
  }
  pdfFileRateStore.set(key, count + incoming);
  next();
}

function validatePdfFilesOrFail(files, res) {
  if (!Array.isArray(files)) return true;
  for (const file of files) {
    if (!allowedPdfMimes.has(file.mimetype)) {
      sendError(res, 415, 'unsupported_media_type', 'Unsupported file type uploaded.', {
        hint: 'Only application/pdf is accepted.',
      });
      return false;
    }
  }
  return true;
}

function getPdfFiles(req) {
  return (req.files || []).filter(f => allowedPdfMimes.has(f.mimetype));
}

function getWatermarkImage(req) {
  if (!req.files) return null;
  return (req.files || []).find(f => f.fieldname === 'watermarkImage' && f.mimetype && f.mimetype.startsWith('image/'));
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

function parsePageNumbers(pages, pageCount) {
  if (!pages || pages === 'all') {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  if (pages === 'first') return [1];

  const list = new Set();
  pages
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(p => parseInt(p, 10));
        if (Number.isFinite(start) && Number.isFinite(end)) {
          for (let i = Math.max(1, start); i <= Math.min(pageCount, end); i++) list.add(i);
        }
      } else {
        const pageNum = parseInt(part, 10);
        if (Number.isFinite(pageNum) && pageNum >= 1 && pageNum <= pageCount) list.add(pageNum);
      }
    });
  const pagesArr = Array.from(list).sort((a, b) => a - b);
  return pagesArr.length ? pagesArr : [1];
}

function parseBoolean(val, fallback = false) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return fallback;
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

function positionCoords(pageWidth, pageHeight, itemWidth, itemHeight, position, margin) {
  const pos = parsePosition(position);
  const m = Math.max(margin || 0, 0);
  let x = (pageWidth - itemWidth) / 2;
  let y = (pageHeight - itemHeight) / 2;
  if (pos === 'top-left') {
    x = m;
    y = pageHeight - itemHeight - m;
  } else if (pos === 'top-right') {
    x = pageWidth - itemWidth - m;
    y = pageHeight - itemHeight - m;
  } else if (pos === 'bottom-left') {
    x = m;
    y = m;
  } else if (pos === 'bottom-right') {
    x = pageWidth - itemWidth - m;
    y = m;
  } else if (pos === 'top') {
    y = pageHeight - itemHeight - m;
  } else if (pos === 'bottom') {
    y = m;
  } else if (pos === 'left') {
    x = m;
  } else if (pos === 'right') {
    x = pageWidth - itemWidth - m;
  }
  return { x, y };
}

function parseColorHexToRgb(color, fallback = { r: 0, g: 0, b: 0 }) {
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

async function qpdfExists() {
  return new Promise(resolve => {
    execFile('qpdf', ['--version'], err => {
      resolve(!err);
    });
  });
}

async function runQpdf(args) {
  return new Promise((resolve, reject) => {
    execFile('qpdf', args, err => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function pdfToImages(buffer, options, pdfDir) {
  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();
  const pageNumbers = parsePageNumbers(options.pages, pageCount);
  const toFormat = (options.toFormat || 'png').toLowerCase();
  const dpi = options.dpi ? parseInt(options.dpi, 10) : 150;
  const width = options.width ? parseInt(options.width, 10) : null;
  const height = options.height ? parseInt(options.height, 10) : null;

  const tempPdfName = `${uuidv4()}.pdf`;
  const tempPdfPath = path.join(pdfDir, tempPdfName);
  await fs.promises.writeFile(tempPdfPath, buffer);

  const baseOutName = `${uuidv4()}_page`;
  const baseOutPath = path.join(pdfDir, baseOutName);

  const args = ['-png', '-r', String(dpi)];
  if (Number.isInteger(width)) args.push('-scale-to-x', String(width));
  if (Number.isInteger(height)) args.push('-scale-to-y', String(height));

  const fromPage = Math.min(...pageNumbers);
  const toPage = Math.max(...pageNumbers);
  args.push('-f', String(fromPage), '-l', String(toPage));
  args.push(tempPdfPath, baseOutPath);

  await new Promise((resolve, reject) => {
    execFile('pdftoppm', args, err => {
      if (err) return reject(err);
      resolve();
    });
  });

  const files = await fs.promises.readdir(pdfDir);
  const targets = files
    .filter(name => name.startsWith(`${baseOutName}-`) && name.endsWith('.png'))
    .map(name => ({
      name,
      page: parseInt(name.replace(`${baseOutName}-`, '').replace('.png', ''), 10),
    }))
    .filter(entry => Number.isFinite(entry.page) && pageNumbers.includes(entry.page))
    .sort((a, b) => a.page - b.page);

  const results = [];
  for (const entry of targets) {
    const pngPath = path.join(pdfDir, entry.name);
    const buf = await fs.promises.readFile(pngPath);
    let pipeline = sharp(buf);
    if (width || height) {
      pipeline = pipeline.resize(width || null, height || null, { fit: 'inside', withoutEnlargement: true });
    }

    const targetFormat = ['jpeg', 'jpg', 'png', 'webp'].includes(toFormat) ? toFormat : 'png';
    let transformer = pipeline;
    if (targetFormat === 'jpeg' || targetFormat === 'jpg') transformer = transformer.jpeg({ quality: 80 });
    else if (targetFormat === 'png') transformer = transformer.png();
    else if (targetFormat === 'webp') transformer = transformer.webp({ quality: 80 });

    const outputBuffer = await transformer.toBuffer();
    const meta = await sharp(outputBuffer).metadata();
    results.push({
      buffer: outputBuffer,
      meta,
      format: targetFormat === 'jpg' ? 'jpeg' : targetFormat,
      pageNumber: entry.page,
    });

    await fs.promises.unlink(pngPath).catch(() => {});
  }

  await fs.promises.unlink(tempPdfPath).catch(() => {});
  return results;
}

async function compressPdf(buffer) {
  const doc = await PDFDocument.load(buffer);
  const newDoc = await PDFDocument.create();
  const pages = await newDoc.copyPages(doc, doc.getPageIndices());
  pages.forEach(page => newDoc.addPage(page));
  return newDoc.save();
}

async function mergePdfs(files, sortByName) {
  const sortedFiles = sortByName
    ? [...files].sort((a, b) => (a.originalname || '').localeCompare(b.originalname || ''))
    : files;
  const outDoc = await PDFDocument.create();
  for (const file of sortedFiles) {
    const doc = await PDFDocument.load(file.buffer);
    const pages = await outDoc.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => outDoc.addPage(p));
  }
  return outDoc.save();
}

async function splitPdf(buffer, ranges) {
  const doc = await PDFDocument.load(buffer);
  const outputs = [];
  const parsedRanges = ranges
    .split(',')
    .map(r => r.trim())
    .filter(Boolean)
    .map(range => range.split('-').map(n => parseInt(n, 10) - 1))
    .filter(pair => pair.length === 2 && pair.every(Number.isFinite));

  for (const [start, end] of parsedRanges) {
    const newDoc = await PDFDocument.create();
    const cappedStart = Math.max(0, start);
    const cappedEnd = Math.min(doc.getPageCount() - 1, end);
    const pages = await newDoc.copyPages(
      doc,
      Array.from({ length: cappedEnd - cappedStart + 1 }, (_, i) => cappedStart + i)
    );
    pages.forEach(p => newDoc.addPage(p));
    outputs.push({
      range: `${cappedStart + 1}-${cappedEnd + 1}`,
      buffer: await newDoc.save(),
    });
  }
  return outputs;
}

module.exports = function (app, { checkApiKey, pdfDir, baseUrl, publicTimeoutMiddleware }) {
  app.post(
    '/v1/pdf',
    checkApiKey,
    publicTimeoutMiddleware,
    handleMulter(upload.any()),
    checkPdfDailyLimit,
    wrapAsync(async (req, res) => {
      const pdfFiles = getPdfFiles(req);
      const watermarkImageFile = getWatermarkImage(req);
      if (!validatePdfFilesOrFail(pdfFiles, res)) return;
      const isCustomer = req.apiKeyType === 'customer';
      const { ip, userAgent } = extractClientInfo(req);
      const files = pdfFiles;
      const filesToConsume = files.length || 1;
      const bytesIn = files.reduce((s, f) => s + (f.size || 0), 0);
      let bytesOut = 0;
      let hadError = false;
      let errorCode = null;
      let errorMessage = null;
      let usageRecord = null;
      let actionUsed = null;
      let pagesUsed = null;

      try {
        actionUsed = req.body?.action || null;
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

        const { action } = req.body;
        if (!action) {
          hadError = true;
          errorCode = 'missing_field';
          errorMessage = "The 'action' field is required.";
          return sendError(res, 400, 'missing_field', "The 'action' field is required.", {
            hint: "Provide an 'action' such as 'to-images', 'merge', 'split', or 'compress'.",
          });
        }

        // Validate public limits
        if (req.apiKeyType === 'public') {
          const incomingFiles = pdfFiles;
          if ((action === 'merge' || action === 'split') && incomingFiles.length > PUBLIC_MAX_FILES) {
            hadError = true;
            errorCode = 'too_many_files';
            errorMessage = 'Too many files were uploaded in one request.';
            return sendError(res, 413, 'too_many_files', 'Too many files were uploaded in one request.', {
              hint: 'Reduce the number of files to 10 or fewer.',
            });
          }
          const totalSize = incomingFiles.reduce((s, f) => s + f.size, 0);
          if (totalSize > PUBLIC_MAX_BYTES) {
            hadError = true;
            errorCode = 'payload_too_large';
            errorMessage = 'The uploaded files are too large.';
            return sendError(res, 413, 'payload_too_large', 'The uploaded files are too large.', {
              hint: 'Reduce total upload size to 10 MB or less.',
            });
          }
        }

        const filesList = pdfFiles;

        if (action === 'merge') {
          if (!filesList.length) {
            hadError = true;
            errorCode = 'missing_field';
            errorMessage = 'A PDF file is required.';
            return sendError(res, 400, 'missing_field', 'A PDF file is required.', {
              hint: "Upload one or more PDFs in the 'files' field.",
            });
          }
          const sortByName = req.body.sortByName ? req.body.sortByName.toLowerCase() === 'true' : false;
          const mergedBuffer = await mergePdfs(filesList, sortByName);
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          await fs.promises.writeFile(filePath, mergedBuffer);
          bytesOut = mergedBuffer.length;
          return res.json({
            url: `${baseUrl}/pdf/${fileName}`,
            sizeBytes: mergedBuffer.length,
            pageCount: (await PDFDocument.load(mergedBuffer)).getPageCount(),
          });
        }

        const singleFile = filesList[0];
        if (!singleFile || !singleFile.buffer || !(singleFile.mimetype || '').includes('pdf')) {
          hadError = true;
          errorCode = 'missing_field';
          errorMessage = 'A PDF file is required.';
          return sendError(res, 400, 'missing_field', 'A PDF file is required.', {
            hint: "Upload a PDF in the 'file' field.",
          });
        }

        if (action === 'to-images') {
          pagesUsed = req.body.pages || null;
          const images = await pdfToImages(
            singleFile.buffer,
            {
              toFormat: req.body.toFormat,
              pages: req.body.pages,
              width: req.body.width,
              height: req.body.height,
              dpi: req.body.dpi,
            },
            pdfDir
          );
          const results = [];
          for (const img of images) {
            const ext = img.format === 'jpeg' ? 'jpg' : img.format;
            const fileName = `${uuidv4()}.${ext}`;
            const filePath = path.join(pdfDir, fileName);
            await fs.promises.writeFile(filePath, img.buffer);
            results.push({
              url: `${baseUrl}/pdf/${fileName}`,
              format: img.format,
              sizeBytes: img.buffer.length,
              width: img.meta.width || null,
              height: img.meta.height || null,
              pageNumber: img.pageNumber,
            });
          }
          bytesOut = results.reduce((s, r) => s + (r.sizeBytes || 0), 0);
          return res.json({ results });
        }

        if (action === 'compress') {
          const compressed = await compressPdf(singleFile.buffer);
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          await fs.promises.writeFile(filePath, compressed);
          bytesOut = compressed.length;
          return res.json({
            url: `${baseUrl}/pdf/${fileName}`,
            originalSizeBytes: singleFile.size,
            newSizeBytes: compressed.length,
            compressionRatio: compressed.length / singleFile.size,
          });
        }

        if (action === 'extract-images') {
          pagesUsed = req.body.pages || null;
          const images = await pdfToImages(
            singleFile.buffer,
            {
              toFormat: req.body.imageFormat || 'png',
              pages: req.body.pages,
            },
            pdfDir
          );
          const results = [];
          for (const img of images) {
            const ext = img.format === 'jpeg' ? 'jpg' : img.format;
            const fileName = `${uuidv4()}.${ext}`;
            const filePath = path.join(pdfDir, fileName);
            await fs.promises.writeFile(filePath, img.buffer);
            results.push({
              url: `${baseUrl}/pdf/${fileName}`,
              format: img.format,
              sizeBytes: img.buffer.length,
              width: img.meta.width || null,
              height: img.meta.height || null,
              pageNumber: img.pageNumber,
            });
          }
          bytesOut = results.reduce((s, r) => s + (r.sizeBytes || 0), 0);
          return res.json({ results });
        }

        // ---- New actions ----
        if (action === 'watermark') {
          const wmText = req.body.watermarkText || null;
          const wmImage = watermarkImageFile || null;
          if (!wmText && !wmImage) {
            hadError = true;
            errorCode = 'invalid_parameter';
            errorMessage = 'A watermarkText or watermarkImage is required.';
            return sendError(res, 400, 'invalid_parameter', 'A watermarkText or watermarkImage is required.', {
              hint: 'Provide watermarkText or upload watermarkImage.',
            });
          }
          const doc = await PDFDocument.load(singleFile.buffer);
          const pages = doc.getPages();
          pagesUsed = req.body.pages || null;
          const selectedPages = parsePageNumbers(req.body.pages || 'all', pages.length);
          const opacity = clampNumber(req.body.opacity, 0, 1, 0.3);
          const margin = clampInt(req.body.margin, 0, 5000, 24);
          const position = req.body.position || 'center';
          const fontSize = clampInt(req.body.fontSize, 1, 400, 24);
          const color = parseColorHexToRgb(req.body.color || '#000000', { r: 0, g: 0, b: 0 });
          const watermarkScale = clampNumber(req.body.watermarkScale, 0.01, 1, 0.25);

          let embeddedImage = null;
          let embeddedFont = null;
          if (wmImage && wmImage.buffer) {
            if ((wmImage.mimetype || '').includes('png')) {
              embeddedImage = await doc.embedPng(wmImage.buffer);
            } else {
              embeddedImage = await doc.embedJpg(wmImage.buffer);
            }
          }
          if (wmText) {
            embeddedFont = await doc.embedFont(StandardFonts.Helvetica);
          }

          for (const pageIndex of selectedPages) {
            const page = pages[pageIndex - 1];
            const pageWidth = page.getWidth();
            const pageHeight = page.getHeight();
            if (embeddedImage) {
              const scaleBase = Math.min(pageWidth, pageHeight) * watermarkScale;
              const imgWidth = embeddedImage.width;
              const imgHeight = embeddedImage.height;
              const factor = Math.min(scaleBase / imgWidth, scaleBase / imgHeight, 1);
              const drawWidth = imgWidth * factor;
              const drawHeight = imgHeight * factor;
              const { x, y } = positionCoords(pageWidth, pageHeight, drawWidth, drawHeight, position, margin);
              page.drawImage(embeddedImage, {
                x,
                y,
                width: drawWidth,
                height: drawHeight,
                opacity,
              });
            }
            if (embeddedFont && wmText) {
              const textWidth = embeddedFont.widthOfTextAtSize(wmText, fontSize);
              const textHeight = embeddedFont.heightAtSize(fontSize);
              const { x, y } = positionCoords(pageWidth, pageHeight, textWidth, textHeight, position, margin);
              page.drawText(wmText, {
                x,
                y,
                size: fontSize,
                font: embeddedFont,
                color: rgb(color.r / 255, color.g / 255, color.b / 255),
                opacity,
              });
            }
          }

          const output = await doc.save();
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          await fs.promises.writeFile(filePath, output);
          bytesOut = output.length;
          return res.json({ url: `${baseUrl}/pdf/${fileName}` });
        }

        if (action === 'rotate') {
          const deg = parseInt(req.body.degrees, 10);
          if (![90, 180, 270].includes(deg)) {
            hadError = true;
            errorCode = 'invalid_parameter';
            errorMessage = 'Invalid rotation degrees.';
            return sendError(res, 400, 'invalid_parameter', 'Invalid rotation degrees.', {
              hint: 'Use 90, 180, or 270.',
            });
          }
          const doc = await PDFDocument.load(singleFile.buffer);
          const pages = doc.getPages();
          pagesUsed = req.body.pages || null;
          const selectedPages = parsePageNumbers(req.body.pages || 'all', pages.length);
          for (const pageIndex of selectedPages) {
            const page = pages[pageIndex - 1];
            const current = page.getRotation().angle;
            page.setRotation(degrees((current + deg) % 360));
          }
          const output = await doc.save();
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          await fs.promises.writeFile(filePath, output);
          bytesOut = output.length;
          return res.json({ url: `${baseUrl}/pdf/${fileName}` });
        }

        if (action === 'metadata') {
          const doc = await PDFDocument.load(singleFile.buffer);
          const clean = parseBoolean(req.body.cleanAllMetadata, false);
          if (clean) {
            doc.setTitle('');
            doc.setAuthor('');
            doc.setSubject('');
            doc.setKeywords([]);
            doc.setProducer('');
            doc.setCreator('');
          }
          if (req.body.title) doc.setTitle(req.body.title);
          if (req.body.author) doc.setAuthor(req.body.author);
          if (req.body.subject) doc.setSubject(req.body.subject);
          if (req.body.keywords) doc.setKeywords([req.body.keywords]);
          if (req.body.creator) doc.setCreator(req.body.creator);
          if (req.body.producer) doc.setProducer(req.body.producer);
          const output = await doc.save();
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          await fs.promises.writeFile(filePath, output);
          bytesOut = output.length;
          return res.json({ url: `${baseUrl}/pdf/${fileName}` });
        }

        if (action === 'reorder') {
          const orderRaw = req.body.order;
          let orderArr = null;
          try {
            orderArr = JSON.parse(orderRaw || '[]');
          } catch (e) {
            orderArr = null;
          }
          const doc = await PDFDocument.load(singleFile.buffer);
          const pageCount = doc.getPageCount();
          if (!Array.isArray(orderArr) || orderArr.length !== pageCount) {
            return sendError(res, 400, 'invalid_parameter', 'Order must include all pages.', {
              hint: 'Provide order as JSON array of page numbers.',
            });
          }
          const seen = new Set();
          for (const n of orderArr) {
            if (!Number.isInteger(n) || n < 1 || n > pageCount || seen.has(n)) {
              return sendError(res, 400, 'invalid_parameter', 'Order must be a permutation of all pages.', {
                hint: 'Use 1-based unique indices.',
              });
            }
            seen.add(n);
          }
          const newDoc = await PDFDocument.create();
          const pagesToCopy = await newDoc.copyPages(doc, orderArr.map(n => n - 1));
          pagesToCopy.forEach(p => newDoc.addPage(p));
          const output = await newDoc.save();
          const fileName = `${uuidv4()}.pdf`;
          await fs.promises.writeFile(path.join(pdfDir, fileName), output);
          bytesOut = output.length;
          return res.json({ url: `${baseUrl}/pdf/${fileName}` });
        }

        if (action === 'delete-pages') {
          const doc = await PDFDocument.load(singleFile.buffer);
          const pageCount = doc.getPageCount();
          pagesUsed = req.body.pages || null;
          const pagesToDelete = new Set(parsePageNumbers(req.body.pages, pageCount));
          if (pagesToDelete.size === pageCount) {
            return sendError(res, 400, 'invalid_parameter', 'Cannot delete all pages.', {
              hint: 'Leave at least one page.',
            });
          }
          const newDoc = await PDFDocument.create();
          const keepIndices = doc.getPageIndices().filter(idx => !pagesToDelete.has(idx + 1));
          const copied = await newDoc.copyPages(doc, keepIndices);
          copied.forEach(p => newDoc.addPage(p));
          const output = await newDoc.save();
          const fileName = `${uuidv4()}.pdf`;
          await fs.promises.writeFile(path.join(pdfDir, fileName), output);
          bytesOut = output.length;
          return res.json({ url: `${baseUrl}/pdf/${fileName}` });
        }

        if (action === 'extract') {
          const mode = (req.body.mode || 'single').toLowerCase() === 'multiple' ? 'multiple' : 'single';
          const doc = await PDFDocument.load(singleFile.buffer);
          const pageCount = doc.getPageCount();
          pagesUsed = req.body.pages || null;
          const selectedPages = parsePageNumbers(req.body.pages, pageCount);
          if (mode === 'single') {
            const newDoc = await PDFDocument.create();
            const copied = await newDoc.copyPages(doc, selectedPages.map(p => p - 1));
            copied.forEach(p => newDoc.addPage(p));
            const output = await newDoc.save();
            const fileName = `${uuidv4()}.pdf`;
            await fs.promises.writeFile(path.join(pdfDir, fileName), output);
            bytesOut = output.length;
            return res.json({
              url: `${baseUrl}/pdf/${fileName}`,
              pageCount: selectedPages.length,
            });
          } else {
            const results = [];
            for (const pageNum of selectedPages) {
              const newDoc = await PDFDocument.create();
              const copied = await newDoc.copyPages(doc, [pageNum - 1]);
              copied.forEach(p => newDoc.addPage(p));
              const output = await newDoc.save();
              const fileName = `${uuidv4()}.pdf`;
              await fs.promises.writeFile(path.join(pdfDir, fileName), output);
              results.push({
                url: `${baseUrl}/pdf/${fileName}`,
                page: pageNum,
              });
              bytesOut += output.length;
            }
            return res.json({ results });
          }
        }

        if (action === 'flatten') {
          const doc = await PDFDocument.load(singleFile.buffer);
          const flattenForms = parseBoolean(req.body.flattenForms, true);
          if (flattenForms && doc.getForm) {
            const form = doc.getForm();
            if (form && form.flatten) {
              form.flatten();
            }
          }
          const output = await doc.save();
          const fileName = `${uuidv4()}.pdf`;
          await fs.promises.writeFile(path.join(pdfDir, fileName), output);
          bytesOut = output.length;
          return res.json({ url: `${baseUrl}/pdf/${fileName}` });
        }

        if (action === 'encrypt') {
          const userPassword = req.body.userPassword;
          const ownerPassword = req.body.ownerPassword || userPassword;
          if (!userPassword) {
            return sendError(res, 400, 'invalid_parameter', 'userPassword is required for encryption.');
          }
          const hasQpdf = await qpdfExists();
          if (!hasQpdf) {
            return sendError(res, 400, 'invalid_parameter', 'qpdf not installed');
          }
          const inputTemp = path.join(pdfDir, `${uuidv4()}-in.pdf`);
          const outputTemp = path.join(pdfDir, `${uuidv4()}-out.pdf`);
          await fs.promises.writeFile(inputTemp, singleFile.buffer);
          try {
            await runQpdf(['--encrypt', userPassword, ownerPassword, '256', '--', inputTemp, outputTemp]);
            const outBuffer = await fs.promises.readFile(outputTemp);
            const fileName = `${uuidv4()}.pdf`;
            await fs.promises.writeFile(path.join(pdfDir, fileName), outBuffer);
            bytesOut = outBuffer.length;
            return res.json({ url: `${baseUrl}/pdf/${fileName}` });
          } catch (err) {
            return sendError(res, 400, 'invalid_parameter', 'Failed to encrypt PDF.', {
              details: err.message,
            });
          } finally {
            fs.promises.unlink(inputTemp).catch(() => {});
            fs.promises.unlink(outputTemp).catch(() => {});
          }
        }

        if (action === 'decrypt') {
          const password = req.body.password;
          if (!password) {
            return sendError(res, 400, 'invalid_parameter', 'password is required for decryption.');
          }
          const hasQpdf = await qpdfExists();
          if (!hasQpdf) {
            return sendError(res, 400, 'invalid_parameter', 'qpdf not installed');
          }
          const inputTemp = path.join(pdfDir, `${uuidv4()}-in.pdf`);
          const outputTemp = path.join(pdfDir, `${uuidv4()}-out.pdf`);
          await fs.promises.writeFile(inputTemp, singleFile.buffer);
          try {
            await runQpdf([`--password=${password}`, '--decrypt', inputTemp, outputTemp]);
            const outBuffer = await fs.promises.readFile(outputTemp);
            const fileName = `${uuidv4()}.pdf`;
            await fs.promises.writeFile(path.join(pdfDir, fileName), outBuffer);
            bytesOut = outBuffer.length;
            return res.json({ url: `${baseUrl}/pdf/${fileName}` });
          } catch (err) {
            return sendError(res, 400, 'invalid_parameter', 'Failed to decrypt PDF.', {
              details: err.message,
            });
          } finally {
            fs.promises.unlink(inputTemp).catch(() => {});
            fs.promises.unlink(outputTemp).catch(() => {});
          }
        }

        if (action === 'split') {
          const ranges = req.body.ranges;
          if (!ranges) {
            hadError = true;
            errorCode = 'missing_field';
            errorMessage = "The 'ranges' field is required for splitting.";
            return sendError(res, 400, 'missing_field', "The 'ranges' field is required for splitting.", {
              hint: "Provide page ranges like '1-3,4-4,5-10'.",
            });
          }
          const outputs = await splitPdf(singleFile.buffer, ranges);
          const prefix = req.body.prefix || 'split_';
          const results = [];
          for (let i = 0; i < outputs.length; i++) {
            const out = outputs[i];
            const fileName = `${prefix}${uuidv4()}.pdf`;
            const filePath = path.join(pdfDir, fileName);
            await fs.promises.writeFile(filePath, out.buffer);
            results.push({
              url: `${baseUrl}/pdf/${fileName}`,
              range: out.range,
              sizeBytes: out.buffer.length,
            });
          }
          bytesOut = results.reduce((s, r) => s + (r.sizeBytes || 0), 0);
          return res.json({ results });
        }

        hadError = true;
        errorCode = 'invalid_parameter';
        errorMessage = 'The specified action is not supported.';
        return sendError(res, 400, 'invalid_parameter', 'The specified action is not supported.', {
          hint: "Choose one of: 'to-images', 'merge', 'split', 'compress', or 'extract-images'.",
        });
      } catch (err) {
        hadError = true;
        errorCode = errorCode || 'pdf_tool_failed';
        errorMessage = errorMessage || 'Failed to process the PDF file.';
        console.error(err);
        sendError(res, 500, 'pdf_tool_failed', 'Failed to process the PDF file.', {
          hint: 'Verify that the uploaded file is a valid PDF. If it is, contact support.',
          details: err,
        });
      } finally {
        if (isCustomer && req.customerKey) {
          await recordUsageAndLog({
            apiKeyRecord: req.customerKey,
            endpoint: 'pdf',
            action: actionUsed || 'pdf_render',
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
              action: actionUsed,
              pages: pagesUsed,
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
