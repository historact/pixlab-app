const multer = require('multer');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

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
    return res.status(429).json({
      error: 'daily_limit_reached',
      message: 'You have reached the free daily limit for PDF tools. Please try again tomorrow.',
    });
  }
  pdfFileRateStore.set(key, count + incoming);
  next();
}

function parsePages(pages, maxPages) {
  if (!pages || pages === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i);
  }
  if (pages === 'first') return [0];

  const list = new Set();
  pages
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(p => parseInt(p, 10) - 1);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          for (let i = Math.max(0, start); i <= Math.min(maxPages - 1, end); i++) {
            list.add(i);
          }
        }
      } else {
        const pageIdx = parseInt(part, 10) - 1;
        if (Number.isFinite(pageIdx) && pageIdx >= 0 && pageIdx < maxPages) list.add(pageIdx);
      }
    });
  return Array.from(list).sort((a, b) => a - b);
}

async function pdfToImages(buffer, options) {
  const density = options.dpi ? parseInt(options.dpi, 10) : 72;
  const input = sharp(buffer, { density });
  const meta = await input.metadata();
  const pages = meta.pages || 1;
  const pageIndices = parsePages(options.pages, pages);
  const results = [];
  const toFormat = (options.toFormat || 'png').toLowerCase();
  for (const pageIndex of pageIndices) {
    const pageSharp = sharp(buffer, { density, page: pageIndex });
    let pipeline = pageSharp;
    if (options.width || options.height) {
      pipeline = pipeline.resize(options.width ? parseInt(options.width, 10) : null, options.height ? parseInt(options.height, 10) : null, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const outputBuffer = await pipeline.toFormat(toFormat === 'jpeg' ? 'jpeg' : toFormat).toBuffer();
    const outMeta = await sharp(outputBuffer).metadata();
    results.push({ buffer: outputBuffer, meta: outMeta, format: toFormat, pageNumber: pageIndex + 1 });
  }
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
          return res.status(400).json({ error: 'missing_action' });
        }

        // Validate public limits
        if (req.apiKeyType === 'public') {
          const incomingFiles = req.files || [];
          if ((action === 'merge' || action === 'split') && incomingFiles.length > PUBLIC_MAX_FILES) {
            return res.status(400).json({ error: 'too_many_files' });
          }
          const totalSize = incomingFiles.reduce((s, f) => s + f.size, 0);
          if (totalSize > PUBLIC_MAX_BYTES) {
            return res.status(413).json({ error: 'payload_too_large' });
          }
        }

        const files = req.files || [];

        if (action === 'merge') {
          if (!files.length) return res.status(400).json({ error: 'No PDF files uploaded' });
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
        if (!singleFile) {
          return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        if (action === 'to-images') {
          const images = await pdfToImages(singleFile.buffer, {
            toFormat: req.body.toFormat,
            pages: req.body.pages,
            width: req.body.width,
            height: req.body.height,
            dpi: req.body.dpi,
          });
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
          const images = await pdfToImages(singleFile.buffer, {
            toFormat: req.body.imageFormat || 'png',
            pages: req.body.pages,
          });
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
          if (!ranges) return res.status(400).json({ error: 'missing_ranges' });
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

        return res.status(400).json({ error: 'invalid_action' });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'pdf_tool_failed', details: String(err) });
      }
    }
  );
};
