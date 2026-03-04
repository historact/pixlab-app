const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const os = require('os');
const { sendError } = require('../utils/errorResponse');
const { sendNormalizedError } = require('../utils/errorNormalizer');
const {
  recordUsageAndLog,
  getUsagePeriodForKey,
  reserveQuota,
  finalizeQuota,
  refundQuota,
} = require('../usage');
const { extractClientInfo } = require('../utils/requestInfo');
const { attachRequestId } = require('../utils/responseMeta');
const { wrapAsync } = require('../utils/wrapAsync');
const { createUploadMiddleware } = require('../utils/uploadLimits');
const { validatePlanLimits, resolvePdfPageLimits } = require('../utils/limits');
const { buildSignedUrl } = require('../utils/signedUrls');
const { incrementAndGetDailyCount, getUtcDayString } = require('../utils/rateLimitsDaily');
const {
  getRateLimitDbFailureMode,
  getRateLimitFailClosed,
  isProduction,
} = require('../utils/config');
const { createSemaphore } = require('../utils/semaphore');
const { registerSemaphore } = require('../utils/metrics');
const { createCustomerBurstLimiter } = require('../utils/burstLimitMiddleware');
const { logExternal } = require('../utils/logger');
const { sendRateLimitStoreUnavailable } = require('../utils/rateLimitFailures');
const { readIntEnv } = require('../utils/envTime');

function createAbortError() {
  const err = new Error('request_aborted');
  err.code = 'request_aborted';
  return err;
}

function assertNotAborted(req) {
  if (req.abortSignal && req.abortSignal.aborted) {
    throw createAbortError();
  }
}

const allowedPdfMimes = new Set(['application/pdf']);

function parseDailyLimitEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseConcurrencyEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const pdfFileRateStore = new Map();
const PDF_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_PDF_DAILY_LIMIT', 10);
const PDF_CONCURRENCY = parseConcurrencyEnv('PDF_CONCURRENCY', isProduction() ? 2 : 4);
const PDF_CONCURRENCY_WAIT_S = readIntEnv('PDF_CONCURRENCY_WAIT_S', 15);
const pdfConcurrencyWaitMs = PDF_CONCURRENCY_WAIT_S * 1000;
const pdfSemaphore = createSemaphore(PDF_CONCURRENCY);
registerSemaphore('pdf', pdfSemaphore);

function getIp(req) {
  const { ip } = extractClientInfo(req);
  return ip || '0.0.0.0';
}

function checkPdfDailyLimit(req, res, next) {
  if (req.apiKeyType !== 'public') return next();
  const ip = getIp(req);
  const today = getUtcDayString();
  const key = `${ip}:${today}`;
  const incoming = getPdfFiles(req).length;
  (async () => {
    try {
      const count = await incrementAndGetDailyCount({
        scope: 'pdf',
        ip,
        incrementBy: incoming,
        dayUtc: today,
      });
      if (count > PDF_DAILY_LIMIT) {
        return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
          hint: 'Try again tomorrow or contact support if you need higher limits.',
          details: { scope: 'pdf_daily' },
        });
      }
      return next();
    } catch (err) {
      if (getRateLimitFailClosed()) {
        return sendRateLimitStoreUnavailable(res, req, 'pdf', 'rate_limits_daily', err, { failureMode: 'closed' });
      }
      const configuredMode = getRateLimitDbFailureMode();
      const mode =
        isProduction() && req.apiKeyType === 'public' && configuredMode === 'open'
          ? 'closed'
          : configuredMode;
      if (mode === 'closed') {
        return sendRateLimitStoreUnavailable(res, req, 'pdf', 'rate_limits_daily', err, { failureMode: mode, retryAfterSeconds: 30 });
      }
      if (mode === 'open') {
        return next();
      }
      console.warn('[rate_limit] Failed to update rate_limits_daily, falling back to memory store.', err);
      const count = pdfFileRateStore.get(key) || 0;
      if (count + incoming > PDF_DAILY_LIMIT) {
        return sendError(res, 429, 'rate_limit_exceeded', 'You have reached the daily limit for this endpoint.', {
          hint: 'Try again tomorrow or contact support if you need higher limits.',
          details: { scope: 'pdf_daily' },
        });
      }
      pdfFileRateStore.set(key, count + incoming);
      return next();
    }
  })();
}

function enforcePageLimit(res, { pageCount, limit, action }) {
  if (limit && pageCount > limit) {
    sendError(res, 413, 'pdf_page_limit_exceeded', 'PDF page limit exceeded.', {
      details: {
        pageCount,
        limit,
        action,
      },
    });
    return false;
  }
  return true;
}

async function acquirePdfSlot(res, action) {
  try {
    return await pdfSemaphore.acquire({ timeoutMs: pdfConcurrencyWaitMs });
  } catch (err) {
    sendError(res, 503, 'server_busy', 'Server is busy processing PDFs.', {
      details: { action },
    });
    return null;
  }
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

function readFileBuffer(file) {
  if (!file?.path) return Promise.resolve(null);
  return fs.promises.readFile(file.path);
}

const pdfEndpoint = 'pdf';
const pdfEndpointGuard = validatePlanLimits(pdfEndpoint);
const uploadPdf = createUploadMiddleware({
  endpoint: pdfEndpoint,
  additionalFileAllowance: 1,
});

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

async function runCommandWithSignal(command, args, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(createAbortError());
    }
    const child = spawn(command, args, { stdio: 'ignore' });
    const onAbort = () => {
      child.kill('SIGKILL');
      reject(createAbortError());
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('error', err => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      reject(err);
    });
    child.on('exit', code => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command}_failed`));
      }
    });
  });
}

async function runQpdf(args, signal) {
  return runCommandWithSignal('qpdf', args, signal);
}

async function pdfToImages(buffer, options, pdfDir, signal) {
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

  try {
    await runCommandWithSignal('pdftoppm', args, signal);

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
      assertNotAborted({ abortSignal: signal });
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
    return results;
  } finally {
    await fs.promises.unlink(tempPdfPath).catch(() => {});
  }
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
    const buffer = await readFileBuffer(file);
    const doc = await PDFDocument.load(buffer);
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

module.exports = function (app, { checkApiKey, pdfDir, baseUrl, timeoutMiddlewareFactory }) {
  const burstLimiter = createCustomerBurstLimiter('pdf');
  app.post(
    '/v1/pdf',
    checkApiKey,
    pdfEndpointGuard,
    burstLimiter,
    timeoutMiddlewareFactory(pdfEndpoint),
    uploadPdf,
    checkPdfDailyLimit,
    wrapAsync(async (req, res) => {
      const pdfFiles = getPdfFiles(req);
      const watermarkImageFile = getWatermarkImage(req);
      if (!validatePdfFilesOrFail(pdfFiles, res)) return;
      const isCustomer = req.apiKeyType === 'customer';
      const usagePeriod = isCustomer ? getUsagePeriodForKey(req.customerKey, req.customerKey?.plan) : null;
      const { ip, userAgent } = extractClientInfo(req);
      const requestIdForDedupe = req.idempotencyKey ?? req.requestId;
      const files = pdfFiles;
      const pageLimits = resolvePdfPageLimits(req);
      const filesReceived = files.length;
      const bytesIn = files.reduce((s, f) => s + (f.size || 0), 0);
      let bytesOut = 0;
      let hadError = false;
      let errorCode = null;
      let errorMessage = null;
      let actionUsed = null;
      let pagesUsed = null;
      let reserved = 0;
      let outputsCreated = 0;
      let usageFinalized = false;
      let reservedRefunded = false;
      const abortHandler = () => {};

      try {
        actionUsed = req.body?.action || null;
        const reserveFor = async (filesToReserve) => {
          if (!isCustomer || reserved > 0) return true;
          const quota = await reserveQuota({
            apiKeyId: req.customerKey.id,
            period: usagePeriod,
            filesToReserve,
            monthlyQuota: req.customerKey.monthly_quota,
          plan: req.customerKey?.plan || null,
            requestId: requestIdForDedupe,
            endpoint: 'pdf',
          });
          if (!quota.allowed) {
          if (quota.error === 'plan_quota_not_configured') {
            hadError = true;
            errorCode = 'plan_quota_not_configured';
            errorMessage = 'Plan quota is not configured for this key.';
            return sendError(res, 503, 'plan_quota_not_configured', 'Plan quota is not configured for this key.', {
              hint: quota.hint || 'Contact support to configure your plan quota.',
            });
          }
            hadError = true;
            errorCode = 'monthly_quota_exceeded';
            errorMessage = 'Your monthly Pixlab quota has been exhausted.';
            logExternal('quota.denied', {
              quota_name: 'monthly_files',
              limit: req.customerKey.monthly_quota,
              used: quota.usage?.used_files,
              remaining: quota.remaining,
              period: quota.usage?.period,
              request_id: req.requestId,
              api_key_id: req.customerKey?.id,
              user_id: req.customerKey?.user_id || req.customerKey?.wp_user_id,
              plan_slug: req.customerKey?.plan_slug || req.customerKey?.plan,
              plan_name: req.customerKey?.plan_name,
              plan_price: req.customerKey?.plan_price,
              remediation_hint: 'Reduce usage or upgrade your plan tier.',
            }, 'warn');
            sendError(res, 429, 'monthly_quota_exceeded', 'Your monthly Pixlab quota has been exhausted.', {
              details: {
                limit: req.customerKey.monthly_quota,
                used: quota.usage?.used_files,
                remaining: quota.remaining,
                period: quota.usage?.period,
                plan_slug: req.customerKey?.plan_slug || req.customerKey?.plan,
                plan_name: req.customerKey?.plan_name,
                plan_price: req.customerKey?.plan_price,
              },
            });
            return false;
          }
          reserved = filesToReserve;
          return true;
        };
        const attemptRefund = async amount => {
          if (!isCustomer || !req.customerKey) return false;
          const refundCount = Math.max(Number(amount) || 0, 0);
          if (!refundCount) return false;
          try {
            await refundQuota({
              apiKeyId: req.customerKey.id,
              period: usagePeriod,
              reservedToRefund: refundCount,
              requestId: requestIdForDedupe,
              endpoint: 'pdf',
            });
            return true;
          } catch (refundErr) {
            logExternal('pdf.refund_failed', { message: refundErr.message }, 'warn');
            return false;
          }
        };
        const finalizeOrRefund = async ({ finalizeCount, actionName, paramsForLog }) => {
          if (!isCustomer || !req.customerKey || finalizeCount <= 0) return;
          try {
            const finalizeResult = await finalizeQuota({
              apiKeyId: req.customerKey.id,
              period: usagePeriod,
              reservedToFinalize: finalizeCount,
              filesReceived,
              requestId: requestIdForDedupe,
              endpoint: 'pdf',
              action: actionName,
              bytesIn,
              bytesOut,
              statusCode: res.statusCode || 200,
              ip,
              userAgent,
              paramsForLog,
            });
            if (finalizeResult?.finalized || finalizeResult?.duplicate) {
              usageFinalized = true;
              if (finalizeResult?.duplicate) {
                reservedRefunded = true;
              }
              return;
            }
          } catch (finalizeErr) {
            // continue to refund
          }
          reservedRefunded = (await attemptRefund(Math.max(reserved, finalizeCount))) || reservedRefunded;
          usageFinalized = true;
        };

        const { action } = req.body;
        if (!action) {
          hadError = true;
          errorCode = 'missing_field';
          errorMessage = "The 'action' field is required.";
          return sendNormalizedError(res, req, new Error("The 'action' field is required."), {
            statusCode: 400,
            code: 'missing_field',
            message: "The 'action' field is required.",
            hint: 'Valid actions: to-images, merge, split, compress, extract-images, rotate, delete-pages, reorder, watermark, encrypt, decrypt, flatten.',
            details: { field: 'action', allowed_actions: ['to-images', 'merge', 'split', 'compress', 'extract-images', 'rotate', 'delete-pages', 'reorder', 'watermark', 'encrypt', 'decrypt', 'flatten'], reason: 'request_validation_failed', operation: 'request_validation', endpoint: 'pdf' },
            component: 'pdf',
            operation: 'request_validation',
            stage: 'validate_action',
            event: 'pdf.validation_failed',
            level: 'warn',
          });
        }

        if (req.abortSignal) {
          if (req.abortSignal.aborted) {
            throw createAbortError();
          }
          req.abortSignal.addEventListener('abort', abortHandler, { once: true });
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
          if (!(await reserveFor(1))) return;
          const release = await acquirePdfSlot(res, 'merge');
          if (!release) {
            hadError = true;
            errorCode = 'server_busy';
            errorMessage = 'Server is busy processing PDFs.';
            return;
          }
          const sortByName = req.body.sortByName ? req.body.sortByName.toLowerCase() === 'true' : false;
          try {
            const mergedBuffer = await mergePdfs(filesList, sortByName);
            const fileName = `${uuidv4()}.pdf`;
            const filePath = path.join(pdfDir, fileName);
            assertNotAborted(req);
            await fs.promises.writeFile(filePath, mergedBuffer);
            bytesOut = mergedBuffer.length;
            outputsCreated = 1;
            if (isCustomer && req.customerKey) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'merge',
                paramsForLog: { action: 'merge' },
              });
            }
            return res.json(
              attachRequestId(req, {
                url: buildSignedUrl(baseUrl, `/pdf/${fileName}`),
                sizeBytes: mergedBuffer.length,
                pageCount: (await PDFDocument.load(mergedBuffer)).getPageCount(),
              })
            );
          } finally {
            release();
          }
        }

        const singleFile = filesList[0];
        if (!singleFile || !singleFile.path || !(singleFile.mimetype || '').includes('pdf')) {
          hadError = true;
          errorCode = 'missing_field';
          errorMessage = 'A PDF file is required.';
          return sendError(res, 400, 'missing_field', 'A PDF file is required.', {
            hint: "Upload a PDF in the 'file' field.",
          });
        }

        if (action === 'to-images') {
          pagesUsed = req.body.pages || null;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const pageCount = (await PDFDocument.load(singleFileBuffer)).getPageCount();
          if (!enforcePageLimit(res, { pageCount, limit: pageLimits.toImages, action: 'to-images' })) {
            hadError = true;
            errorCode = 'pdf_page_limit_exceeded';
            errorMessage = 'PDF page limit exceeded.';
            return;
          }
          const expectedOutputs = parsePageNumbers(req.body.pages || 'all', pageCount).length || 1;
          if (!(await reserveFor(expectedOutputs))) return;
          const release = await acquirePdfSlot(res, 'to-images');
          if (!release) {
            hadError = true;
            errorCode = 'server_busy';
            errorMessage = 'Server is busy processing PDFs.';
            return;
          }
          try {
            const images = await pdfToImages(
              singleFileBuffer,
              {
                toFormat: req.body.toFormat,
                pages: req.body.pages,
                width: req.body.width,
                height: req.body.height,
                dpi: req.body.dpi,
              },
              pdfDir,
              req.abortSignal
            );
            const results = [];
            for (const img of images) {
              const ext = img.format === 'jpeg' ? 'jpg' : img.format;
              const fileName = `${uuidv4()}.${ext}`;
              const filePath = path.join(pdfDir, fileName);
              assertNotAborted(req);
              await fs.promises.writeFile(filePath, img.buffer);
              results.push({
                url: buildSignedUrl(baseUrl, `/pdf/${fileName}`),
                format: img.format,
                sizeBytes: img.buffer.length,
                width: img.meta.width || null,
                height: img.meta.height || null,
                pageNumber: img.pageNumber,
              });
            }
            bytesOut = results.reduce((s, r) => s + (r.sizeBytes || 0), 0);
            outputsCreated = results.length;
            if (isCustomer && req.customerKey && outputsCreated > 0) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'to-images',
                paramsForLog: { action: 'to-images', pages: pagesUsed },
              });
            }
            return res.json(attachRequestId(req, { results }));
          } finally {
            release();
          }
        }

        if (action === 'compress') {
          if (!(await reserveFor(1))) return;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const compressed = await compressPdf(singleFileBuffer);
          const fileName = `${uuidv4()}.pdf`;
          const filePath = path.join(pdfDir, fileName);
          assertNotAborted(req);
          await fs.promises.writeFile(filePath, compressed);
          bytesOut = compressed.length;
          outputsCreated = 1;
          if (isCustomer && req.customerKey) {
            await finalizeOrRefund({
              finalizeCount: outputsCreated,
              actionName: 'compress',
              paramsForLog: { action: 'compress' },
            });
          }
          return res.json(
            attachRequestId(req, {
              url: buildSignedUrl(baseUrl, `/pdf/${fileName}`),
              originalSizeBytes: singleFile.size,
              newSizeBytes: compressed.length,
              compressionRatio: compressed.length / singleFile.size,
            })
          );
        }

        if (action === 'extract-images') {
          pagesUsed = req.body.pages || null;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const pageCount = (await PDFDocument.load(singleFileBuffer)).getPageCount();
          if (!enforcePageLimit(res, { pageCount, limit: pageLimits.extractImages, action: 'extract-images' })) {
            hadError = true;
            errorCode = 'pdf_page_limit_exceeded';
            errorMessage = 'PDF page limit exceeded.';
            return;
          }
          const expectedOutputs = parsePageNumbers(req.body.pages || 'all', pageCount).length || 1;
          if (!(await reserveFor(expectedOutputs))) return;
          const release = await acquirePdfSlot(res, 'extract-images');
          if (!release) {
            hadError = true;
            errorCode = 'server_busy';
            errorMessage = 'Server is busy processing PDFs.';
            return;
          }
          try {
            const images = await pdfToImages(
              singleFileBuffer,
              {
                toFormat: req.body.imageFormat || 'png',
                pages: req.body.pages,
              },
              pdfDir,
              req.abortSignal
            );
            const results = [];
            for (const img of images) {
              const ext = img.format === 'jpeg' ? 'jpg' : img.format;
              const fileName = `${uuidv4()}.${ext}`;
              const filePath = path.join(pdfDir, fileName);
              assertNotAborted(req);
              await fs.promises.writeFile(filePath, img.buffer);
              results.push({
                url: buildSignedUrl(baseUrl, `/pdf/${fileName}`),
                format: img.format,
                sizeBytes: img.buffer.length,
                width: img.meta.width || null,
                height: img.meta.height || null,
                pageNumber: img.pageNumber,
              });
            }
            bytesOut = results.reduce((s, r) => s + (r.sizeBytes || 0), 0);
            outputsCreated = results.length;
            if (isCustomer && req.customerKey && outputsCreated > 0) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'extract-images',
                paramsForLog: { action: 'extract-images', pages: pagesUsed },
              });
            }
            return res.json(attachRequestId(req, { results }));
          } finally {
            release();
          }
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
          if (!(await reserveFor(1))) return;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const doc = await PDFDocument.load(singleFileBuffer);
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
          if (wmImage && wmImage.path) {
            const wmBuffer = await readFileBuffer(wmImage);
            if ((wmImage.mimetype || '').includes('png')) {
              embeddedImage = await doc.embedPng(wmBuffer);
            } else {
              embeddedImage = await doc.embedJpg(wmBuffer);
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
          assertNotAborted(req);
          await fs.promises.writeFile(filePath, output);
          bytesOut = output.length;
          outputsCreated = 1;
          if (isCustomer && req.customerKey) {
            await finalizeOrRefund({
              finalizeCount: outputsCreated,
              actionName: 'watermark',
              paramsForLog: { action: 'watermark', pages: pagesUsed },
            });
          }
          return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
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
          if (!(await reserveFor(1))) return;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const doc = await PDFDocument.load(singleFileBuffer);
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
          assertNotAborted(req);
          await fs.promises.writeFile(filePath, output);
          bytesOut = output.length;
          outputsCreated = 1;
          if (isCustomer && req.customerKey) {
            await finalizeOrRefund({
              finalizeCount: outputsCreated,
              actionName: 'rotate',
              paramsForLog: { action: 'rotate', pages: pagesUsed },
            });
          }
          return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
        }

        if (action === 'metadata') {
          if (!(await reserveFor(1))) return;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const doc = await PDFDocument.load(singleFileBuffer);
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
          assertNotAborted(req);
          await fs.promises.writeFile(filePath, output);
          bytesOut = output.length;
          outputsCreated = 1;
          if (isCustomer && req.customerKey) {
            await finalizeOrRefund({
              finalizeCount: outputsCreated,
              actionName: 'metadata',
              paramsForLog: { action: 'metadata' },
            });
          }
          return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
        }

        if (action === 'reorder') {
          const orderRaw = req.body.order;
          let orderArr = null;
          try {
            orderArr = JSON.parse(orderRaw || '[]');
          } catch (e) {
            orderArr = null;
          }
          const singleFileBuffer = await readFileBuffer(singleFile);
          const doc = await PDFDocument.load(singleFileBuffer);
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
          if (!(await reserveFor(1))) return;
          const newDoc = await PDFDocument.create();
          const pagesToCopy = await newDoc.copyPages(doc, orderArr.map(n => n - 1));
          pagesToCopy.forEach(p => newDoc.addPage(p));
          const output = await newDoc.save();
          const fileName = `${uuidv4()}.pdf`;
          assertNotAborted(req);
          await fs.promises.writeFile(path.join(pdfDir, fileName), output);
          bytesOut = output.length;
          outputsCreated = 1;
          if (isCustomer && req.customerKey) {
            await finalizeOrRefund({
              finalizeCount: outputsCreated,
              actionName: 'reorder',
              paramsForLog: { action: 'reorder' },
            });
          }
          return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
        }

        if (action === 'delete-pages') {
          const singleFileBuffer = await readFileBuffer(singleFile);
          const doc = await PDFDocument.load(singleFileBuffer);
          const pageCount = doc.getPageCount();
          pagesUsed = req.body.pages || null;
          const pagesToDelete = new Set(parsePageNumbers(req.body.pages, pageCount));
          if (pagesToDelete.size === pageCount) {
            return sendError(res, 400, 'invalid_parameter', 'Cannot delete all pages.', {
              hint: 'Leave at least one page.',
            });
          }
          if (!(await reserveFor(1))) return;
          const newDoc = await PDFDocument.create();
          const keepIndices = doc.getPageIndices().filter(idx => !pagesToDelete.has(idx + 1));
          const copied = await newDoc.copyPages(doc, keepIndices);
          copied.forEach(p => newDoc.addPage(p));
          const output = await newDoc.save();
          const fileName = `${uuidv4()}.pdf`;
          assertNotAborted(req);
          await fs.promises.writeFile(path.join(pdfDir, fileName), output);
          bytesOut = output.length;
          outputsCreated = 1;
          if (isCustomer && req.customerKey) {
            await finalizeOrRefund({
              finalizeCount: outputsCreated,
              actionName: 'delete-pages',
              paramsForLog: { action: 'delete-pages', pages: pagesUsed },
            });
          }
          return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
        }

        if (action === 'extract') {
          const mode = (req.body.mode || 'single').toLowerCase() === 'multiple' ? 'multiple' : 'single';
          const singleFileBuffer = await readFileBuffer(singleFile);
          const doc = await PDFDocument.load(singleFileBuffer);
          const pageCount = doc.getPageCount();
          pagesUsed = req.body.pages || null;
          const selectedPages = parsePageNumbers(req.body.pages, pageCount);
          const expectedOutputs = mode === 'single' ? 1 : selectedPages.length;
          if (!(await reserveFor(expectedOutputs))) return;
          if (mode === 'single') {
            const newDoc = await PDFDocument.create();
            const copied = await newDoc.copyPages(doc, selectedPages.map(p => p - 1));
            copied.forEach(p => newDoc.addPage(p));
            const output = await newDoc.save();
            const fileName = `${uuidv4()}.pdf`;
            assertNotAborted(req);
            await fs.promises.writeFile(path.join(pdfDir, fileName), output);
            bytesOut = output.length;
            outputsCreated = 1;
            if (isCustomer && req.customerKey) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'extract',
                paramsForLog: { action: 'extract', pages: pagesUsed },
              });
            }
            return res.json(
              attachRequestId(req, {
                url: buildSignedUrl(baseUrl, `/pdf/${fileName}`),
                pageCount: selectedPages.length,
              })
            );
          } else {
            const results = [];
            for (const pageNum of selectedPages) {
              const newDoc = await PDFDocument.create();
              const copied = await newDoc.copyPages(doc, [pageNum - 1]);
              copied.forEach(p => newDoc.addPage(p));
              const output = await newDoc.save();
              const fileName = `${uuidv4()}.pdf`;
              assertNotAborted(req);
              await fs.promises.writeFile(path.join(pdfDir, fileName), output);
              results.push({
                url: buildSignedUrl(baseUrl, `/pdf/${fileName}`),
                page: pageNum,
              });
              bytesOut += output.length;
            }
            outputsCreated = results.length;
            if (isCustomer && req.customerKey && outputsCreated > 0) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'extract',
                paramsForLog: { action: 'extract', pages: pagesUsed },
              });
            }
            return res.json(attachRequestId(req, { results }));
          }
        }

        if (action === 'flatten') {
          const singleFileBuffer = await readFileBuffer(singleFile);
          const doc = await PDFDocument.load(singleFileBuffer);
          const flattenForms = parseBoolean(req.body.flattenForms, true);
          if (flattenForms && doc.getForm) {
            const form = doc.getForm();
            if (form && form.flatten) {
              form.flatten();
            }
          }
          if (!(await reserveFor(1))) return;
          const output = await doc.save();
          const fileName = `${uuidv4()}.pdf`;
          assertNotAborted(req);
          await fs.promises.writeFile(path.join(pdfDir, fileName), output);
          bytesOut = output.length;
          outputsCreated = 1;
          if (isCustomer && req.customerKey) {
            await finalizeOrRefund({
              finalizeCount: outputsCreated,
              actionName: 'flatten',
              paramsForLog: { action: 'flatten' },
            });
          }
          return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
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
          if (!(await reserveFor(1))) return;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const inputTemp = path.join(pdfDir, `${uuidv4()}-in.pdf`);
          const outputTemp = path.join(pdfDir, `${uuidv4()}-out.pdf`);
          await fs.promises.writeFile(inputTemp, singleFileBuffer);
          try {
            await runQpdf(['--encrypt', userPassword, ownerPassword, '256', '--', inputTemp, outputTemp], req.abortSignal);
            const outBuffer = await fs.promises.readFile(outputTemp);
            const fileName = `${uuidv4()}.pdf`;
            assertNotAborted(req);
            await fs.promises.writeFile(path.join(pdfDir, fileName), outBuffer);
            bytesOut = outBuffer.length;
            outputsCreated = 1;
            if (isCustomer && req.customerKey) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'encrypt',
                paramsForLog: { action: 'encrypt' },
              });
            }
            return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
          } catch (err) {
            return sendError(res, 400, 'invalid_parameter', 'Failed to encrypt PDF.', {
              details: { reason: 'invalid_parameter', operation: action || 'pdf_operation' },
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
          if (!(await reserveFor(1))) return;
          const singleFileBuffer = await readFileBuffer(singleFile);
          const inputTemp = path.join(pdfDir, `${uuidv4()}-in.pdf`);
          const outputTemp = path.join(pdfDir, `${uuidv4()}-out.pdf`);
          await fs.promises.writeFile(inputTemp, singleFileBuffer);
          try {
            await runQpdf([`--password=${password}`, '--decrypt', inputTemp, outputTemp], req.abortSignal);
            const outBuffer = await fs.promises.readFile(outputTemp);
            const fileName = `${uuidv4()}.pdf`;
            assertNotAborted(req);
            await fs.promises.writeFile(path.join(pdfDir, fileName), outBuffer);
            bytesOut = outBuffer.length;
            outputsCreated = 1;
            if (isCustomer && req.customerKey) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'decrypt',
                paramsForLog: { action: 'decrypt' },
              });
            }
            return res.json(attachRequestId(req, { url: buildSignedUrl(baseUrl, `/pdf/${fileName}`) }));
          } catch (err) {
            return sendError(res, 400, 'invalid_parameter', 'Failed to decrypt PDF.', {
              details: { reason: 'invalid_parameter', operation: action || 'pdf_operation' },
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
          const singleFileBuffer = await readFileBuffer(singleFile);
          const pageCount = (await PDFDocument.load(singleFileBuffer)).getPageCount();
          if (!enforcePageLimit(res, { pageCount, limit: pageLimits.split, action: 'split' })) {
            hadError = true;
            errorCode = 'pdf_page_limit_exceeded';
            errorMessage = 'PDF page limit exceeded.';
            return;
          }
          const expectedOutputs = ranges
            .split(',')
            .map(r => r.trim())
            .filter(Boolean)
            .map(range => range.split('-').map(n => parseInt(n, 10) - 1))
            .filter(pair => pair.length === 2 && pair.every(Number.isFinite)).length;
          if (!(await reserveFor(expectedOutputs || 0))) return;
          const release = await acquirePdfSlot(res, 'split');
          if (!release) {
            hadError = true;
            errorCode = 'server_busy';
            errorMessage = 'Server is busy processing PDFs.';
            return;
          }
          try {
            const singleFileBuffer = await readFileBuffer(singleFile);
            const outputs = await splitPdf(singleFileBuffer, ranges);
            const prefix = req.body.prefix || 'split_';
            const results = [];
            for (let i = 0; i < outputs.length; i++) {
              const out = outputs[i];
              const fileName = `${prefix}${uuidv4()}.pdf`;
              const filePath = path.join(pdfDir, fileName);
              assertNotAborted(req);
              await fs.promises.writeFile(filePath, out.buffer);
              results.push({
                url: buildSignedUrl(baseUrl, `/pdf/${fileName}`),
                range: out.range,
                sizeBytes: out.buffer.length,
              });
            }
            bytesOut = results.reduce((s, r) => s + (r.sizeBytes || 0), 0);
            outputsCreated = results.length;
            if (isCustomer && req.customerKey && outputsCreated > 0) {
              await finalizeOrRefund({
                finalizeCount: outputsCreated,
                actionName: 'split',
                paramsForLog: { action: 'split' },
              });
            }
            return res.json(attachRequestId(req, { results }));
          } finally {
            release();
          }
        }

        hadError = true;
        errorCode = 'invalid_parameter';
        errorMessage = 'The specified action is not supported.';
        return sendNormalizedError(res, req, new Error('The specified action is not supported.'), {
          statusCode: 400,
          code: 'invalid_parameter',
          message: 'The specified action is not supported.',
          hint: "Choose one of: 'to-images', 'merge', 'split', 'compress', or 'extract-images'.",
          details: { field: 'action', allowed_actions: ['to-images', 'merge', 'split', 'compress', 'extract-images', 'rotate', 'delete-pages', 'reorder', 'watermark', 'encrypt', 'decrypt', 'flatten'], reason: 'request_validation_failed', operation: 'request_validation', endpoint: 'pdf' },
          component: 'pdf',
          operation: 'request_validation',
          stage: 'validate_action',
          event: 'pdf.validation_failed',
          level: 'warn',
        });
      } catch (err) {
        hadError = true;
        if (err && err.code === 'request_aborted') {
          errorCode = 'timeout';
          errorMessage = 'Request aborted due to timeout.';
          if (!res.headersSent) {
            sendError(res, 503, 'timeout', 'The request took too long to complete.', {
              hint: 'Try again with a smaller payload or fewer operations.',
            });
          }
        } else {
          errorCode = errorCode || 'pdf_tool_failed';
          errorMessage = errorMessage || 'Failed to process the PDF file.';
          if (!res.headersSent) {
            sendNormalizedError(res, req, err, {
              statusCode: 500,
              code: 'pdf_tool_failed',
              message: 'Failed to process the PDF file.',
              hint: 'Verify that the uploaded file is a valid PDF. If it is, contact support.',
              details: { reason: 'processing_failed', operation: 'pdf_processing', action: req.body?.action || null, endpoint: 'pdf' },
              component: 'pdf',
              operation: 'pdf_processing',
              stage: 'handler_catch',
              action: req.body?.action || null,
              event: 'pdf.processing_failed',
              level: 'error',
              remediationHint: 'Verify PDF validity and selected action.',
            });
          }
        }
      } finally {
        if (req.abortSignal) {
          req.abortSignal.removeEventListener('abort', abortHandler);
        }
        const cleanupTargets = [...files, watermarkImageFile].filter(Boolean);
        await Promise.all(
          cleanupTargets.map(file => (file.path ? fs.promises.unlink(file.path).catch(() => {}) : null))
        );
        if (isCustomer && req.customerKey) {
          if (!reservedRefunded && reserved > outputsCreated) {
            try {
              await refundQuota({
                apiKeyId: req.customerKey.id,
                period: usagePeriod,
                reservedToRefund: reserved - outputsCreated,
                requestId: requestIdForDedupe,
                endpoint: 'pdf',
              });
            } catch (refundErr) {
              logExternal('pdf.refund_failed', { message: refundErr.message }, 'warn');
            }
          }
          if (!usageFinalized) {
            await recordUsageAndLog({
              apiKeyRecord: req.customerKey,
              endpoint: 'pdf',
              action: actionUsed || 'pdf_render',
              filesReceived,
              filesConsumed: hadError ? 0 : outputsCreated,
              bytesIn,
              bytesOut,
              status: res.statusCode || (hadError ? 500 : 200),
              ip,
              userAgent,
              ok: !hadError,
              countCall: !hadError,
              errorCode: hadError ? errorCode : null,
              errorMessage: hadError ? errorMessage : null,
              paramsForLog: {
                action: actionUsed,
                pages: pagesUsed,
              },
              requestId: requestIdForDedupe,
              usagePeriod,
            });
          }
        }
      }
    })
  );
};
