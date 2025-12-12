const multer = require('multer');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { sendError } = require('../utils/errorResponse');

const upload = multer();

const PUBLIC_MAX_FILES = 10;
const PUBLIC_MAX_BYTES = 10 * 1024 * 1024;
const pdfFileRateStore = new Map();
const PDF_DAILY_LIMIT = 10;

function getIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function checkPdfDailyLimit(req, res, next) {
  if (req.apiKeyType !== 'public') return next();
  const ip = getIp(req);
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const incoming = req.files ? req.files.length : req.file ? 1 : 0;
  const count = pdfFileRateStore.get(key) || 0;
  if (count + incoming > PDF_DAILY_LIMIT) {
    return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
      hint: 'Try again tomorrow or contact support if you need higher limits.',
    });
  }
  pdfFileRateStore.set(key, count + incoming);
  next();
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
    upload.any(),
    checkPdfDailyLimit,
    async (req, res) => {
      try {
        const { action } = req.body;
        if (!action) {
          return sendError(res, 400, 'missing_field', "The 'action' field is required.", {
            hint: "Provide an 'action' such as 'to-images', 'merge', 'split', or 'compress'.",
          });
        }

        // Validate public limits
        if (req.apiKeyType === 'public') {
          const incomingFiles = req.files || [];
          if ((action === 'merge' || action === 'split') && incomingFiles.length > PUBLIC_MAX_FILES) {
            return sendError(res, 413, 'too_many_files', 'Too many files were uploaded in one request.', {
              hint: 'Reduce the number of files to 10 or fewer.',
            });
          }
          const totalSize = incomingFiles.reduce((s, f) => s + f.size, 0);
          if (totalSize > PUBLIC_MAX_BYTES) {
            return sendError(res, 413, 'payload_too_large', 'The uploaded files are too large.', {
              hint: 'Reduce total upload size to 10 MB or less.',
            });
          }
        }

        const files = req.files || [];

        if (action === 'merge') {
          if (!files.length) {
            return sendError(res, 400, 'missing_field', 'A PDF file is required.', {
              hint: "Upload one or more PDFs in the 'files' field.",
            });
          }
          const sortByName = req.body.sortByName ? req.body.sortByName.toLowerCase() === 'true' : false;
          const mergedBuffer = await mergePdfs(files, sortByName);
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          await fs.promises.writeFile(filePath, mergedBuffer);
          return res.json({
            url: `${baseUrl}/pdf/${fileName}`,
            sizeBytes: mergedBuffer.length,
            pageCount: (await PDFDocument.load(mergedBuffer)).getPageCount(),
          });
        }

        const singleFile = files[0];
        if (!singleFile || !singleFile.buffer || !(singleFile.mimetype || '').includes('pdf')) {
          return sendError(res, 400, 'missing_field', 'A PDF file is required.', {
            hint: "Upload a PDF in the 'file' field.",
          });
        }

        if (action === 'to-images') {
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
          return res.json({ results });
        }

        if (action === 'compress') {
          const compressed = await compressPdf(singleFile.buffer);
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          await fs.promises.writeFile(filePath, compressed);
          return res.json({
            url: `${baseUrl}/pdf/${fileName}`,
            originalSizeBytes: singleFile.size,
            newSizeBytes: compressed.length,
            compressionRatio: compressed.length / singleFile.size,
          });
        }

        if (action === 'extract-images') {
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
          return res.json({ results });
        }

        if (action === 'split') {
          const ranges = req.body.ranges;
          if (!ranges) {
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
          return res.json({ results });
        }

        return sendError(res, 400, 'invalid_parameter', 'The specified action is not supported.', {
          hint: "Choose one of: 'to-images', 'merge', 'split', 'compress', or 'extract-images'.",
        });
      } catch (err) {
        console.error(err);
        sendError(res, 500, 'pdf_tool_failed', 'Failed to process the PDF file.', {
          hint: 'Verify that the uploaded file is a valid PDF. If it is, contact support.',
          details: err,
        });
      }
    }
  );
};
