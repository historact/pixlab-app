const multer = require('multer');
const sharp = require('sharp');
const { sendError } = require('./errorResponse');
const { resolveRequestLimits } = require('./limits');

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

function createMemoryStorageWithLimits({ uploadLimits, shouldCheckDimensions }) {
  return {
    _handleFile(req, file, cb) {
      const state = req._uploadState || { totalBytes: 0 };
      req._uploadState = state;

      const chunks = [];
      let header = Buffer.alloc(0);
      let aborted = false;
      let headerDimensionsFound = false;

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
      file.stream.once('end', async () => {
        if (aborted) return;
        const buffer = Buffer.concat(chunks);
        if (uploadLimits.maxDimensionPx && shouldCheckDimensions(file) && !headerDimensionsFound) {
          try {
            const isSvg = (file.mimetype || '').includes('svg');
            let dims = null;
            if (isSvg) {
              dims = parseSvgDimensions(buffer);
            } else {
              const meta = await sharp(buffer).metadata();
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
