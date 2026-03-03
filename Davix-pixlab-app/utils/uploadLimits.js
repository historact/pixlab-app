const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { sendNormalizedError } = require('./errorNormalizer');
const { resolveRequestLimits } = require('./limits');
const { logInternal } = require('./logger');
const { addRequestDiagnostics } = require('./requestInfo');

const uploadAttemptTrackerKey = Symbol('uploadAttemptTracker');

function initUploadAttemptTracker(req) {
  if (!req) return;
  if (!req[uploadAttemptTrackerKey]) {
    req[uploadAttemptTrackerKey] = {
      attemptedCount: 0,
      attemptedFields: [],
      attemptedFieldSet: new Set(),
    };
  }
}

function noteUploadAttempt(req, fieldname) {
  if (!req) return;
  initUploadAttemptTracker(req);
  const tracker = req[uploadAttemptTrackerKey];
  tracker.attemptedCount += 1;
  const normalizedField = typeof fieldname === 'string' ? fieldname.trim() : '';
  if (normalizedField && !tracker.attemptedFieldSet.has(normalizedField)) {
    tracker.attemptedFieldSet.add(normalizedField);
    tracker.attemptedFields.push(normalizedField);
  }
}

function getUploadAttemptInfo(req) {
  const tracker = req?.[uploadAttemptTrackerKey];
  if (!tracker) {
    return { attemptedCount: 0, attemptedFields: [] };
  }
  return {
    attemptedCount: Number.isFinite(tracker.attemptedCount) ? tracker.attemptedCount : 0,
    attemptedFields: Array.isArray(tracker.attemptedFields) ? [...tracker.attemptedFields] : [],
  };
}

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

function collectUploadFieldNames(req) {
  const out = new Set();
  if (Array.isArray(req?.files)) {
    req.files.forEach(file => {
      if (file && typeof file.fieldname === 'string' && file.fieldname.trim()) out.add(file.fieldname.trim());
    });
  } else if (req?.files && typeof req.files === 'object') {
    Object.keys(req.files).forEach(key => {
      if (key && key.trim()) out.add(key.trim());
      const value = req.files[key];
      if (Array.isArray(value)) {
        value.forEach(file => {
          if (file && typeof file.fieldname === 'string' && file.fieldname.trim()) out.add(file.fieldname.trim());
        });
      }
    });
  }
  if (req?.file && typeof req.file.fieldname === 'string' && req.file.fieldname.trim()) {
    out.add(req.file.fieldname.trim());
  }
  return Array.from(out).slice(0, 25);
}

function countUploadedFiles(req) {
  let count = 0;
  if (Array.isArray(req?.files)) {
    count += req.files.length;
  } else if (req?.files && typeof req.files === 'object') {
    Object.keys(req.files).forEach(key => {
      if (Array.isArray(req.files[key])) count += req.files[key].length;
    });
  }
  if (req?.file) count += 1;
  return count;
}

function deriveReceivedCount(req, err, fallbackCount) {
  const attemptedInfo = getUploadAttemptInfo(req);
  let attemptedCount = attemptedInfo.attemptedCount;
  if (err?.code === 'LIMIT_UNEXPECTED_FILE' && attemptedCount <= fallbackCount) {
    attemptedCount = fallbackCount + 1;
  }
  if (err?.code === 'LIMIT_FILE_COUNT' && attemptedCount <= fallbackCount) {
    attemptedCount = fallbackCount + 1;
  }
  return {
    attemptedCount: Math.max(attemptedCount, fallbackCount),
    attemptedFields: attemptedInfo.attemptedFields,
  };
}

function resolveExpectedFields(allowedFields) {
  if (!Array.isArray(allowedFields)) return [];
  return allowedFields
    .map(field => (field && typeof field.name === 'string' ? field.name.trim() : ''))
    .filter(Boolean);
}

function captureUploadDiagnostics(req, details = {}) {
  addRequestDiagnostics(req, {
    upload_validation: {
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: details.stage || 'multer_mapping',
      endpoint: details.endpoint || resolveEndpointLabel(req),
      safe_summary: details.safe_summary || 'Upload validation failed.',
      remediation_hint: details.remediation_hint || 'Validate upload fields, mime types, and plan limits.',
      rule: details.rule || null,
      quota_name: details.quota_name || null,
      allowed: details.allowed,
      received: details.received,
      fields: Array.isArray(details.fields) ? details.fields : undefined,
      field: details.field,
      reason: details.reason || 'upload_validation_failed',
      ...buildActorContext(req),
    },
  });
}

function logUploadValidationInternal(req, details = {}) {
  const pathValue = String(req?.originalUrl || req?.path || '');
  if (!pathValue.startsWith('/internal/')) return;
  logInternal(
    'upload.validation_failed',
    {
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: details.stage || 'multer_mapping',
      endpoint: details.endpoint || resolveEndpointLabel(req),
      safe_summary: details.safe_summary || 'Upload validation failed.',
      remediation_hint: details.remediation_hint || 'Validate upload fields, mime types, and plan limits.',
      rule: details.rule || null,
      quota_name: details.quota_name || null,
      allowed: details.allowed,
      received: details.received,
      fields: Array.isArray(details.fields) ? details.fields : undefined,
      field: details.field,
      reason: details.reason || 'upload_validation_failed',
      ...buildActorContext(req),
    },
    'warn'
  );
}

function recordUploadValidation(req, details = {}) {
  captureUploadDiagnostics(req, details);
  logUploadValidationInternal(req, details);
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
              limit_mb: uploadLimits.maxTotalUploadMb,
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

function mapMulterError(err, req, res, uploadLimits, endpoint, allowedFields = null) {
  const endpointLabel = resolveEndpointLabel(req, endpoint);
  const uploadedCount = countUploadedFiles(req);
  const attemptInfo = deriveReceivedCount(req, err, uploadedCount);
  const receivedCount = attemptInfo.attemptedCount;
  const allowedCount = Number.isFinite(uploadLimits?.maxFiles) ? uploadLimits.maxFiles : null;
  const fields = attemptInfo.attemptedFields.length ? attemptInfo.attemptedFields : collectUploadFieldNames(req);
  const expectedFields = resolveExpectedFields(allowedFields);
  const receivedField = typeof err?.field === 'string' && err.field.trim()
    ? err.field.trim()
    : (attemptInfo.attemptedFields[attemptInfo.attemptedFields.length - 1] || undefined);
  const baseDetails = {
    endpoint: endpointLabel,
    plan_slug: req?.customerKey?.plan_slug || req?.customerKey?.plan || undefined,
    plan_name: req?.customerKey?.plan_name || undefined,
    plan_price: req?.customerKey?.plan_price,
    reason: 'upload_validation_failed',
    operation: 'upload_validation',
  };

  if (err.code === 'LIMIT_FILE_SIZE') {
    recordUploadValidation(req, {
      ...baseDetails,
      stage: 'multer_limit_file_size',
      rule: 'per_file_size',
      quota_name: 'per_file_limit_bytes',
      allowed: uploadLimits.perFileLimitBytes,
      received: receivedCount,
      fields,
      field: err.field,
      safe_summary: 'Uploaded file exceeds per-file size limit.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 413,
      code: 'file_too_large',
      message: 'Uploaded file exceeds size limit.',
      hint: `Max size: ${uploadLimits.perFileLimitBytes} bytes per file.`,
      details: { ...baseDetails, limit: uploadLimits.perFileLimitBytes, field: err.field },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'multer_limit_file_size',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    const reason = 'too_many_files';
    const details = {
      ...baseDetails,
      allowed: allowedCount,
      received: receivedCount,
      fields,
      field: err.field,
      reason,
    };
    recordUploadValidation(req, {
      ...details,
      stage: 'multer_limit_file_count',
      rule: 'max_files_per_request',
      quota_name: 'max_files_per_request',
      safe_summary: `Too many files uploaded: received ${receivedCount}, allowed ${allowedCount}.`,
      remediation_hint: 'Send only the allowed number of files for your plan or upgrade.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 413,
      code: 'too_many_files',
      message: `Too many files uploaded: received ${receivedCount}, allowed ${allowedCount}.`,
      hint: `Too many files were uploaded. Allowed: ${allowedCount}, received: ${receivedCount}.`,
      details,
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'multer_limit_file_count',
      endpoint: endpointLabel,
      event: 'upload.limit_exceeded',
      level: 'warn',
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const details = {
      ...baseDetails,
      reason: 'unexpected_file_field',
      allowed: allowedCount,
      received: receivedCount,
      expected_fields: expectedFields,
      received_field: receivedField,
      fields,
      field: receivedField,
    };
    recordUploadValidation(req, {
      ...details,
      stage: 'multer_limit_unexpected_file',
      rule: 'expected_multipart_fields',
      quota_name: 'multipart_fields',
      safe_summary: 'Unexpected multipart file field received during upload.',
      remediation_hint: 'Use the expected multipart file field name(s) for this endpoint.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 400,
      code: 'invalid_upload',
      message: 'Upload failed validation.',
      hint: 'Unexpected file field. Use the expected upload field name(s), then retry.',
      details,
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'multer_limit_unexpected_file',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'TOTAL_UPLOAD_EXCEEDED') {
    const limitBytes = err.details?.limit_bytes;
    const limitMb = Number.isFinite(err.details?.limit_mb) ? err.details.limit_mb : null;
    recordUploadValidation(req, {
      ...baseDetails,
      stage: 'upload_total_size_check',
      rule: 'total_upload_bytes',
      quota_name: 'max_total_upload_bytes',
      allowed: limitBytes,
      received: receivedCount,
      fields,
      safe_summary: 'Total upload payload exceeds allowed request size.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 413,
      code: 'total_upload_exceeded',
      message: 'Total upload size exceeds the allowed limit.',
      hint: limitMb !== null
        ? `Max total upload: ${limitMb} MB.`
        : (Number.isFinite(limitBytes) ? `Max total upload: ${limitBytes} bytes.` : undefined),
      details: { ...baseDetails, limit: limitMb !== null ? limitMb : limitBytes },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'upload_total_size_check',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'DIMENSION_EXCEEDED') {
    recordUploadValidation(req, {
      ...baseDetails,
      stage: 'upload_dimension_check',
      rule: 'max_dimension_px',
      quota_name: 'max_dimension_px',
      allowed: err.details?.limit_px,
      received: receivedCount,
      fields,
      safe_summary: 'Uploaded image dimensions exceed the allowed limit.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 400,
      code: 'dimension_exceeded',
      message: 'Uploaded image exceeds allowed dimensions.',
      details: { ...baseDetails, limit: err.details?.limit_px },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'upload_dimension_check',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'UNREADABLE_IMAGE') {
    recordUploadValidation(req, {
      ...baseDetails,
      stage: 'upload_dimension_read',
      rule: 'unreadable_image',
      quota_name: 'image_metadata_read',
      received: receivedCount,
      fields,
      safe_summary: 'Unable to read image dimensions during upload validation.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 400,
      code: 'invalid_upload',
      message: 'Upload failed validation.',
      hint: 'Verify that the uploaded image is valid and retry.',
      details: { ...baseDetails },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'upload_dimension_read',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }
  if (err.code === 'UNSUPPORTED_MEDIA_TYPE') {
    recordUploadValidation(req, {
      ...baseDetails,
      stage: 'file_filter',
      rule: 'mime_type',
      quota_name: 'allowed_mime_types',
      received: receivedCount,
      fields,
      field: err.field,
      safe_summary: 'Unsupported media type uploaded.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 415,
      code: 'unsupported_media_type',
      message: 'Unsupported file type uploaded.',
      hint: err.details?.hint,
      details: { ...baseDetails, field: err.field },
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'file_filter',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }

  const isTooManyFiles = Number.isFinite(allowedCount) && Number.isFinite(receivedCount) && receivedCount > allowedCount;
  if (isTooManyFiles) {
    const details = {
      ...baseDetails,
      allowed: allowedCount,
      received: receivedCount,
      fields,
      reason: 'too_many_files',
    };
    recordUploadValidation(req, {
      ...details,
      stage: 'multer_error_mapping',
      rule: 'max_files_per_request',
      quota_name: 'max_files_per_request',
      safe_summary: `Too many files uploaded: received ${receivedCount}, allowed ${allowedCount}.`,
      remediation_hint: 'Send only the allowed number of files for your plan or upgrade.',
    });
    return sendNormalizedError(res, req, err, {
      statusCode: 400,
      code: 'invalid_upload',
      message: `Upload failed validation: received ${receivedCount} file(s), allowed ${allowedCount}.`,
      hint: `Too many files were uploaded. Allowed: ${allowedCount}, received: ${receivedCount}.`,
      details,
      component: 'upload_limits',
      operation: 'upload_validation',
      stage: 'multer_error_mapping',
      endpoint: endpointLabel,
      event: 'upload.validation_failed',
      level: 'warn',
    });
  }

  recordUploadValidation(req, {
    ...baseDetails,
    stage: 'multer_error_mapping',
    rule: 'unknown_upload_validation_error',
    quota_name: 'upload_validation',
    allowed: allowedCount,
    received: receivedCount,
    fields,
    safe_summary: 'Upload validation failed due to an unknown upload validation error.',
  });
  return sendNormalizedError(res, req, err, {
    statusCode: 400,
    code: 'invalid_upload',
    message: 'Upload failed validation.',
    hint: 'Verify upload form fields and file constraints, then retry.',
    details: { ...baseDetails, allowed: allowedCount, received: receivedCount },
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
    initUploadAttemptTracker(req);
    const limits = resolveRequestLimits(req, endpoint);
    const uploadLimits = limits.upload;

    const fields = typeof fieldsBuilder === 'function' ? fieldsBuilder(uploadLimits) : null;
    const baseFileLimit = Number.isFinite(uploadLimits.maxFiles) ? uploadLimits.maxFiles : null;
    const multerFileLimit =
      baseFileLimit !== null ? baseFileLimit + (additionalFileAllowance || 0) : undefined;
    const storage = createDiskStorageWithLimits({ uploadLimits, shouldCheckDimensions });
    const wrappedFileFilter = (uploadReq, file, cb) => {
      noteUploadAttempt(uploadReq, file?.fieldname);
      if (typeof fileFilter === 'function') {
        return fileFilter(uploadReq, file, cb);
      }
      return cb(null, true);
    };

    const upload = multer({
      storage,
      fileFilter: wrappedFileFilter,
      limits: {
        files: Number.isFinite(multerFileLimit) ? multerFileLimit : undefined,
        fileSize: uploadLimits.perFileLimitBytes,
      },
    });

    const middleware = fields ? upload.fields(fields) : upload.any();

    middleware(req, res, err => {
      if (err) {
        return mapMulterError(err, req, res, uploadLimits, endpoint, fields);
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
  initUploadAttemptTracker,
  noteUploadAttempt,
  getUploadAttemptInfo,
};
