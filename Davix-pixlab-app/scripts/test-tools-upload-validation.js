const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'mysql2/promise') {
    return {
      createPool: () => ({
        execute: async () => [[]],
        query: async () => [[]],
        getConnection: async () => ({
          query: async () => [[]],
          execute: async () => [[]],
          beginTransaction: async () => {},
          commit: async () => {},
          rollback: async () => {},
          release: () => {},
        }),
      }),
    };
  }
  if (request === 'multer') {
    return () => ({ fields: () => (req, res, next) => next(), any: () => (req, res, next) => next() });
  }
  if (request === 'sharp') {
    const stub = () => ({ metadata: async () => ({ width: 1, height: 1 }) });
    stub.cache = () => {};
    stub.concurrency = () => {};
    return stub;
  }
  return originalLoad(request, parent, isMain);
};
const assert = require('assert');
const { resolveRequestLimits } = require('../utils/limits');
const { mapMulterError, initUploadAttemptTracker } = require('../utils/uploadLimits');

function makeReq(plan = {}) {
  return {
    apiKeyType: 'customer',
    customerKey: {
      id: 1,
      user_id: 1,
      plan_slug: 'h2i-free',
      plan_name: 'H2I Free',
      plan_price: '0.00',
      plan,
    },
    originalUrl: '/v1/tools',
    path: '/v1/tools',
  };
}

function makeRes(req) {
  const result = { statusCode: null, payload: null, headers: {} };
  return {
    req,
    setHeader(key, value) {
      result.headers[key] = value;
    },
    status(code) {
      result.statusCode = code;
      return {
        json(payload) {
          result.payload = payload;
        },
      };
    },
    _result: result,
  };
}

(function testToolsLimitFieldMappingAndUnitConversion() {
  const req = makeReq({
    max_upload_bytes_per_file: 10 * 1024 * 1024,
    max_total_upload_mb: 5,
    tools_max_total_upload_mb: 30,
  });

  const uploadLimits = resolveRequestLimits(req, 'tools').upload;
  assert.strictEqual(uploadLimits.perFileLimitBytes, 10 * 1024 * 1024);
  assert.strictEqual(uploadLimits.maxTotalUploadMb, 30);
  assert.strictEqual(uploadLimits.maxTotalBytes, 30 * 1024 * 1024);
  assert(133 * 1024 < uploadLimits.perFileLimitBytes);
})();

(function testPerFileTooLargeErrorDetailsUseBytesPerFile() {
  const req = makeReq({
    max_upload_bytes_per_file: 10 * 1024 * 1024,
    max_total_upload_mb: 5,
    tools_max_total_upload_mb: 30,
  });
  initUploadAttemptTracker(req);
  const res = makeRes(req);
  const uploadLimits = resolveRequestLimits(req, 'tools').upload;

  mapMulterError({ code: 'LIMIT_FILE_SIZE', field: 'images' }, req, res, uploadLimits, 'tools', null);

  assert.strictEqual(res._result.statusCode, 413);
  assert.strictEqual(res._result.payload.code, 'file_too_large');
  assert.strictEqual(res._result.payload.error.hint, `Max size: ${10 * 1024 * 1024} bytes per file.`);
  assert.strictEqual(res._result.payload.error.details.limit, 10 * 1024 * 1024);
})();

(function testTotalUploadExceededErrorDetailsUseMbHint() {
  const req = makeReq({
    max_upload_bytes_per_file: 10 * 1024 * 1024,
    max_total_upload_mb: 5,
    tools_max_total_upload_mb: 30,
  });
  initUploadAttemptTracker(req);
  const res = makeRes(req);
  const uploadLimits = resolveRequestLimits(req, 'tools').upload;

  mapMulterError(
    { code: 'TOTAL_UPLOAD_EXCEEDED', details: { limit_bytes: 30 * 1024 * 1024, limit_mb: 30 } },
    req,
    res,
    uploadLimits,
    'tools',
    null
  );

  assert.strictEqual(res._result.statusCode, 413);
  assert.strictEqual(res._result.payload.code, 'total_upload_exceeded');
  assert.strictEqual(res._result.payload.error.hint, 'Max total upload: 30 MB.');
  assert.strictEqual(res._result.payload.error.details.limit, 30);
})();

console.log('test-tools-upload-validation: OK');
