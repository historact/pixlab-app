const multer = require('multer');
const sharp = require('sharp');
const { sendError } = require('./errorResponse');
const { resolveRequestLimits } = require('./limits');

class UploadLimitError extends Error {
  constructor(code, status, message, details = null) {
    super(message || code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function createMemoryStorageWithLimits({ uploadLimits, shouldCheckDimensions }) {
  return {
    _handleFile(req, file, cb) {
      const state = req._uploadState || { totalBytes: 0 };
      req._uploadState = state;

      const chunks = [];
      let aborted = false;

      const fail = err => {
        if (aborted) return;
        aborted = true;
        if (file.stream.destroy) {
          file.stream.destroy(err);
        } else {
          file.stream.unpipe && file.stream.unpipe();
          file.stream.removeAllListeners && file.stream.removeAllListeners();
        }
        cb(err);
      };

      file.stream.on('data', chunk => {
        if (aborted) return;
        state.totalBytes += chunk.length;
        if (uploadLimits.maxTotalBytes && state.totalBytes > uploadLimits.maxTotalBytes) {
          return fail(
            new UploadLimitError('TOTAL_UPLOAD_EXCEEDED', 413, 'Total upload limit exceeded.', {
              limit_bytes: uploadLimits.maxTotalBytes,
            })
          );
        }
        chunks.push(chunk);
      });

      file.stream.once('error', err => fail(err));
      file.stream.once('end', async () => {
        if (aborted) return;
        const buffer = Buffer.concat(chunks);
        const metaCheckNeeded = Boolean(uploadLimits.maxDimensionPx && shouldCheckDimensions(file));

        if (metaCheckNeeded) {
          try {
            const meta = await sharp(buffer).metadata();
            const width = meta.width || null;
            const height = meta.height || null;
            if (width && height && (width > uploadLimits.maxDimensionPx || height > uploadLimits.maxDimensionPx)) {
              return fail(
                new UploadLimitError('DIMENSION_EXCEEDED', 400, 'Image dimensions exceed the allowed limit.', {
                  width,
                  height,
                  limit_px: uploadLimits.maxDimensionPx,
                })
              );
            }
          } catch (err) {
            return fail(
              new UploadLimitError('UNREADABLE_IMAGE', 400, 'Unable to read uploaded image metadata.', {
                message: err.message,
              })
            );
          }
        }

        cb(null, {
          buffer,
          size: buffer.length,
          encoding: file.encoding,
          mimetype: file.mimetype,
          originalname: file.originalname,
          fieldname: file.fieldname,
        });
      });
    },
    _removeFile(req, file, cb) {
      if (file.stream) file.stream.resume();
      cb(null);
    },
  };
}

function mapMulterError(err, res, uploadLimits) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 413, 'file_too_large', 'Uploaded file exceeds size limit.', {
      hint: `Max size: ${uploadLimits.perFileLimitBytes} bytes per file.`,
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return sendError(res, 413, 'too_many_files', 'Too many files were uploaded.', {
      hint: `Max files per request: ${uploadLimits.maxFiles ?? 'unknown'}.`,
    });
  }
  if (err.code === 'TOTAL_UPLOAD_EXCEEDED') {
    return sendError(res, 413, 'total_upload_exceeded', 'Total upload size exceeds the allowed limit.', {
      details: err.details,
    });
  }
  if (err.code === 'DIMENSION_EXCEEDED') {
    return sendError(res, 400, 'dimension_exceeded', 'Uploaded image exceeds allowed dimensions.', {
      details: err.details,
    });
  }
  if (err.code === 'UNREADABLE_IMAGE') {
    return sendError(res, 400, 'invalid_upload', 'Upload failed validation.', {
      details: err.details,
    });
  }
  return sendError(res, 400, 'invalid_upload', 'Upload failed validation.', {
    details: err.message,
  });
}

function createUploadMiddleware({
  endpoint,
  fieldsBuilder = null,
  shouldCheckDimensions = () => false,
  additionalFileAllowance = 0,
}) {
  return (req, res, next) => {
    const limits = resolveRequestLimits(req, endpoint);
    const uploadLimits = limits.upload;

    const fields = typeof fieldsBuilder === 'function' ? fieldsBuilder(uploadLimits) : null;
    const baseFileLimit = Number.isFinite(uploadLimits.maxFiles) ? uploadLimits.maxFiles : null;
    const multerFileLimit =
      baseFileLimit !== null ? baseFileLimit + (additionalFileAllowance || 0) : undefined;
    const storage = createMemoryStorageWithLimits({ uploadLimits, shouldCheckDimensions });
    const upload = multer({
      storage,
      limits: {
        files: Number.isFinite(multerFileLimit) ? multerFileLimit : undefined,
        fileSize: uploadLimits.perFileLimitBytes,
      },
    });

    const middleware = fields ? upload.fields(fields) : upload.any();

    middleware(req, res, err => {
      if (err) {
        return mapMulterError(err, res, uploadLimits);
      }
      return next();
    });
  };
}

module.exports = {
  createUploadMiddleware,
};
