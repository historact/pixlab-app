const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { sendError } = require('./errorResponse');
const { sendNormalizedError } = require('./errorNormalizer');
const { resolveRequestLimits } = require('./limits');
const { logExternal, logInternal } = require('./logger');

function parseSvgDimensions(buffer) {
  try {
    const str = buffer.toString('utf8');
    const matchViewBox = str.match(/viewBox\s*=\s*"([^"]+)"/i) || str.match(/viewBox\s*=\s*'([^']+)'/i);
    const matchWidth = str.match(/width\s*=\s*"([^"]+)"/i) || str.match(/width\s*=\s*'([^']+)'/i);
    const matchHeight = str.match(/height\s*=\s*"([^"]+)"/i) || str.match(/height\s*=\s*'([^']+)'/i);

    const parseLength = val => {
      if (!val) return null;
      const num = parseFloat(val.replace(/px|em|rem|pt|cm|mm|in/g, ''));
      return Number.isFinite(num) ? num : null;
    };

    const width = parseLength(matchWidth?.[1]);
    const height = parseLength(matchHeight?.[1]);
    if (width && height) return { width, height };

    if (matchViewBox?.[1]) {
      const parts = matchViewBox[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
      if (parts.length === 4) {
        return { width: parts[2], height: parts[3] };
      }
    }
  } catch (e) {
    // ignore parse errors
  }
  return null;
}

function readRasterHeader(prefix, mimetype) {
  const buf = prefix;
  // PNG: width/height at bytes 16-23 (big-endian)
  if (mimetype === 'image/png' && buf.length >= 24 && buf.slice(12, 16).toString() === 'IHDR') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for 0xFFC0/0xFFC2 markers
  if (mimetype === 'image/jpeg') {
    let i = 0;
    while (i < buf.length - 9) {
      if (buf[i] === 0xff && buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xc3) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      i += 1;
    }
  }
  // GIF: width/height at bytes 6-9 (little-endian)
  if (mimetype === 'image/gif' && buf.length >= 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // WebP: RIFF header, VP8/VP8L/VP8X chunks
  if (mimetype === 'image/webp' && buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF') {
    const chunkHeader = buf.toString('ascii', 12, 16);
    if (chunkHeader === 'VP8 ' && buf.length >= 30) {
      const width = ((buf[26] & 0x3F) << 8) | buf[25];
      const height = ((buf[28] & 0x3F) << 8) | buf[27];
      return { width, height };
    }
    if (chunkHeader === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = 1 + (((b1 & 0x3F) << 8) | b0);
      const height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
      return { width, height };
    }
    if (chunkHeader === 'VP8X' && buf.length >= 30) {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { width, height };
    }
  }
  return null;
}

class UploadLimitError extends Error {
  constructor(code, status, message, details = null) {
    super(message || code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'pixlab-uploads');

function ensureTempDir() {
  if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true, mode: 0o700 });
  }
  return TEMP_UPLOAD_DIR;
}

function buildSafeExtension(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext && /^[.][a-z0-9]{1,10}$/.test(ext)) {
    return ext;
  }
  return '';
}


function resolveEndpointLabel(req, fallback) {
  if (fallback) return fallback;
  const pathValue = req?.baseUrl || req?.path || req?.originalUrl || '';
  if (String(pathValue).includes('/v1/image')) return 'image';
  if (String(pathValue).includes('/v1/pdf')) return 'pdf';
  if (String(pathValue).includes('/v1/tools')) return 'tools';
  if (String(pathValue).includes('/v1/h2i')) return 'h2i';
  return null;
}

function buildActorContext(req) {
  if (!req) return {};
  return {
    request_id: req.requestId || null,
    api_key_id: req.customerKey?.id || req.apiKeyRecord?.id || req.apiKeyId || null,
    user_id: req.customerKey?.user_id || req.customerKey?.wp_user_id || req.user?.id || null,
    plan_slug: req.customerKey?.plan_slug || req.customerKey?.plan || null,
    plan_name: req.customerKey?.plan_name || null,
    plan_price: req.customerKey?.plan_price ?? null,
  };
}

function emitUploadLimitLog(req, uploadLimits, details = {}) {
  const pathValue = String(req?.originalUrl || req?.path || '');
  const logFn = pathValue.startsWith('/internal/') ? logInternal : logExternal;
  logFn(
    'upload.limit_exceeded',
    {
      component: 'upload_limits',
      error_code: 'too_many_files',
      allowed: uploadLimits.maxFiles,
      actual: details.received,
      received: details.received,
      field: details.field,
      endpoint: details.endpoint || resolveEndpointLabel(req),
      remediation_hint: 'Reduce files to plan limit or upgrade.',
      ...buildActorContext(req),
    },
    'warn'
  );
}


function emitUploadValidationFailedLog(req, details = {}) {
  const pathValue = String(req?.originalUrl || req?.path || '');
  const logFn = pathValue.startsWith('/internal/') ? logInternal : logExternal;
  logFn(
    'upload.validation_failed',
    {
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: details.stage || 'multer_mapping',
      endpoint: details.endpoint || resolveEndpointLabel(req),
      safe_summary: details.safe_summary || 'Upload validation failed.',
      remediation_hint: details.remediation_hint || 'Validate upload fields, mime types, and plan limits.',
      rule: details.rule || null,
      allowed: details.allowed,
      received: details.received,
      field: details.field,
      reason: details.reason || 'upload_validation_failed',
      ...buildActorContext(req),
    },
    'warn'
  );
}

function createDiskStorageWithLimits({ uploadLimits, shouldCheckDimensions }) {
  const verifyMimes = new Set(['image/jpeg', 'image/webp', 'image/avif']);

  return {
    _handleFile(req, file, cb) {
      const state = req._uploadState || { totalBytes: 0 };
      req._uploadState = state;

      const tempDir = ensureTempDir();
      const safeExt = buildSafeExtension(file.originalname);
      const tempName = `${Date.now()}-${randomUUID()}${safeExt}`;
      const tempPath = path.join(tempDir, tempName);
      const outStream = fs.createWriteStream(tempPath, { mode: 0o600 });
      let header = Buffer.alloc(0);
      let fileBytes = 0;
      let aborted = false;
      let headerDimensionsFound = false;

      const fail = err => {
        if (aborted) return;
        aborted = true;
        outStream.destroy();
        if (file.stream.destroy) {
          file.stream.destroy(err);
        } else {
          file.stream.unpipe && file.stream.unpipe();
          file.stream.removeAllListeners && file.stream.removeAllListeners();
        }
        fs.promises.unlink(tempPath).catch(() => {});
        cb(err);
      };

      file.stream.on('data', chunk => {
        if (aborted) return;
        state.totalBytes += chunk.length;
        fileBytes += chunk.length;
        if (uploadLimits.maxTotalBytes && state.totalBytes > uploadLimits.maxTotalBytes) {
          return fail(
            new UploadLimitError('TOTAL_UPLOAD_EXCEEDED', 413, 'Total upload limit exceeded.', {
              limit_bytes: uploadLimits.maxTotalBytes,
            })
          );
        }

        if (uploadLimits.maxDimensionPx && shouldCheckDimensions(file)) {
          // accumulate only until header parsing is possible
          header = Buffer.concat([header, chunk]).slice(0, 64 * 1024); // cap prefix to 64KB
          const isSvg = (file.mimetype || '').includes('svg');
          let dims = null;
          if (isSvg) {
            dims = parseSvgDimensions(header);
          } else {
            dims = readRasterHeader(header, file.mimetype || '');
          }
          if (dims && dims.width && dims.height) {
            headerDimensionsFound = true;
            if (dims.width > uploadLimits.maxDimensionPx || dims.height > uploadLimits.maxDimensionPx) {
              return fail(
                new UploadLimitError('DIMENSION_EXCEEDED', 400, 'Image dimensions exceed the allowed limit.', {
                  width: dims.width,
                  height: dims.height,
                  limit_px: uploadLimits.maxDimensionPx,
                })
              );
            }
          }
        }
      });

      file.stream.once('error', err => fail(err));
      outStream.on('error', err => fail(err));
      outStream.on('finish', async () => {
        if (aborted) return;
        const shouldVerifyDimensions = uploadLimits.maxDimensionPx && shouldCheckDimensions(file);
        const mimetype = (file.mimetype || '').toLowerCase();
        const needsVerification = verifyMimes.has(mimetype);
        if (shouldVerifyDimensions && (needsVerification || !headerDimensionsFound)) {
          try {
            const isSvg = mimetype.includes('svg');
            let dims = null;
            if (isSvg && !needsVerification) {
              const svgBuffer = await fs.promises.readFile(tempPath);
              dims = parseSvgDimensions(svgBuffer);
            } else {
              const meta = await sharp(tempPath).metadata();
              if (meta && meta.width && meta.height) {
                dims = { width: meta.width, height: meta.height };
              }
            }
            if (dims && dims.width && dims.height) {
              if (dims.width > uploadLimits.maxDimensionPx || dims.height > uploadLimits.maxDimensionPx) {
                return fail(
                  new UploadLimitError('DIMENSION_EXCEEDED', 400, 'Image dimensions exceed the allowed limit.', {
                    width: dims.width,
                    height: dims.height,
                    limit_px: uploadLimits.maxDimensionPx,
                  })
                );
              }
            }
          } catch (e) {
            return fail(
              new UploadLimitError('UNREADABLE_IMAGE', 400, 'Unable to read image dimensions.', {
                message: e.message,
              })
            );
          }
        }
        if (aborted) return;
        cb(null, {
          path: tempPath,
          size: fileBytes,
          encoding: file.encoding,
          mimetype: file.mimetype,
          originalname: file.originalname,
          fieldname: file.fieldname,
        });
      });
      file.stream.pipe(outStream);
    },
    _removeFile(req, file, cb) {
      if (file.stream) file.stream.resume();
      if (file.path) {
        fs.promises.unlink(file.path).catch(() => {}).finally(() => cb(null));
      } else {
        cb(null);
      }
    },
  };
}

function mapMulterError(err, req, res, uploadLimits, endpoint) {
  const endpointLabel = resolveEndpointLabel(req, endpoint);
  const fileCount = Array.isArray(req?.files) ? req.files.length : Array.isArray(req?.files?.images) ? req.files.images.length : undefined;

  if (err.code === 'LIMIT_FILE_SIZE') {
    emitUploadValidationFailedLog(req, {
      endpoint: endpointLabel,
      rule: 'per_file_size',
      allowed: uploadLimits.perFileLimitBytes,
      reason: 'upload_validation_failed',
      safe_summary: 'Uploaded file exceeds per-file size limit.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 413,
      code: 'file_too_large',
      message: 'Uploaded file exceeds size limit.',
      hint: `Max size: ${uploadLimits.perFileLimitBytes} bytes per file.`,
      details: { limit: uploadLimits.perFileLimitBytes, field: err.field, endpoint: endpointLabel, reason: 'upload_validation_failed', operation: 'upload_validation' },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'multer_limit_file_size',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    const details = {
      allowed: uploadLimits.maxFiles,
      received: fileCount,
      field: err.field,
      endpoint: endpointLabel,
      plan_slug: req?.customerKey?.plan_slug || req?.customerKey?.plan || undefined,
      plan_name: req?.customerKey?.plan_name || undefined,
      plan_price: req?.customerKey?.plan_price,
      reason: 'upload_validation_failed',
      operation: 'upload_validation',
    };
    emitUploadLimitLog(req, uploadLimits, details);
    emitUploadValidationFailedLog(req, { ...details, rule: 'max_files' });
    return sendNormalizedError(res, req, err, {
      statusCode: 413,
      code: 'too_many_files',
      message: 'Too many files were uploaded for your plan limit.',
      hint: `Your current plan allows up to ${uploadLimits.maxFiles ?? 'unknown'} file(s) per request. Reduce files or upgrade your plan.`,
      details,
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'multer_limit_file_count',
      endpoint: endpointLabel,
      event: 'upload.limit_exceeded',
      level: 'warn',
    });
  }
  if (err.code === 'TOTAL_UPLOAD_EXCEEDED') {
    const safeDetails = {
      limit: err.details?.limit_bytes,
      endpoint: endpointLabel,
      reason: 'upload_validation_failed',
      operation: 'upload_validation',
    };
    emitUploadValidationFailedLog(req, { ...safeDetails, rule: 'total_upload_bytes' });
    return sendNormalizedError(res, req, err, {
      statusCode: 413,
      code: 'total_upload_exceeded',
      message: 'Total upload size exceeds the allowed limit.',
      details: safeDetails,
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'upload_total_size_check',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'DIMENSION_EXCEEDED') {
    const safeDetails = {
      limit: err.details?.limit_px,
      endpoint: endpointLabel,
      reason: 'upload_validation_failed',
      operation: 'upload_validation',
    };
    emitUploadValidationFailedLog(req, { ...safeDetails, rule: 'max_dimension_px' });
    return sendNormalizedError(res, req, err, {
      statusCode: 400,
      code: 'dimension_exceeded',
      message: 'Uploaded image exceeds allowed dimensions.',
      details: safeDetails,
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'upload_dimension_check',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'UNREADABLE_IMAGE') {
    emitUploadValidationFailedLog(req, {
      endpoint: endpointLabel,
      rule: 'unreadable_image',
      reason: 'upload_validation_failed',
      safe_summary: 'Unable to read image dimensions during upload validation.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 400,
      code: 'invalid_upload',
      message: 'Upload failed validation.',
      hint: 'Verify that the uploaded image is valid and retry.',
      details: { reason: 'upload_validation_failed', operation: 'upload_validation', endpoint: endpointLabel },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'upload_dimension_read',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'UNSUPPORTED_MEDIA_TYPE') {
    emitUploadValidationFailedLog(req, {
      endpoint: endpointLabel,
      rule: 'mime_type',
      field: err.field,
      reason: 'upload_validation_failed',
      safe_summary: 'Unsupported media type uploaded.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 415,
      code: 'unsupported_media_type',
      message: 'Unsupported file type uploaded.',
      hint: err.details?.hint,
      details: { field: err.field, endpoint: endpointLabel, reason: 'upload_validation_failed', operation: 'upload_validation' },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'file_filter',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }

  emitUploadValidationFailedLog(req, {
    endpoint: endpointLabel,
    rule: 'unknown_upload_validation_error',
    reason: 'upload_validation_failed',
  });
  return sendNormalizedError(res, req, err, {
    statusCode: 400,
    code: 'invalid_upload',
    message: 'Upload failed validation.',
    details: { reason: 'upload_validation_failed', operation: 'upload_validation', endpoint: endpointLabel },
    component: 'upload_limits',
    operation: 'upload_validation',
    stage: 'multer_error_mapping',
    endpoint: endpointLabel,
    event: 'upload.validation_failed',
    level: 'warn',
  });
}


function createUploadMiddleware({
  endpoint,
  fieldsBuilder = null,
  shouldCheckDimensions = () => false,
  additionalFileAllowance = 0,
  fileFilter = null,
}) {
  return (req, res, next) => {
    const limits = resolveRequestLimits(req, endpoint);
    const uploadLimits = limits.upload;

    const fields = typeof fieldsBuilder === 'function' ? fieldsBuilder(uploadLimits) : null;
    const baseFileLimit = Number.isFinite(uploadLimits.maxFiles) ? uploadLimits.maxFiles : null;
    const multerFileLimit =
      baseFileLimit !== null ? baseFileLimit + (additionalFileAllowance || 0) : undefined;
    const storage = createDiskStorageWithLimits({ uploadLimits, shouldCheckDimensions });
    const upload = multer({
      storage,
      fileFilter,
      limits: {
        files: Number.isFinite(multerFileLimit) ? multerFileLimit : undefined,
        fileSize: uploadLimits.perFileLimitBytes,
      },
    });

    const middleware = fields ? upload.fields(fields) : upload.any();

    middleware(req, res, err => {
      if (err) {
        return mapMulterError(err, req, res, uploadLimits, endpoint);
      }
      return next();
    });
  };
}

module.exports = {
  createUploadMiddleware,
  ensureTempDir,
  TEMP_UPLOAD_DIR,
  mapMulterError,
};
