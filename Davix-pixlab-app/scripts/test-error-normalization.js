const assert = require('assert');
const { sendError, sanitizeUserDetailsAllowlist } = require('../utils/errorResponse');
const { normalizeError } = require('../utils/errorNormalizer');
const fs = require('fs');
const path = require('path');

function makeRes(reqPath = '/v1/tools') {
  const req = { requestId: 'req-123', originalUrl: reqPath, path: reqPath };
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

(function testAllowlist() {
  const details = sanitizeUserDetailsAllowlist({
    allowed: 2,
    received: 4,
    field: 'images',
    nope: 'drop',
    reason: 'processing_failed',
    operation: 'image_processing',
    scope: 'tools_daily',
    supported: ['x'],
  });
  assert.strictEqual(details.allowed, 2);
  assert.strictEqual(details.received, 4);
  assert.strictEqual(details.field, 'images');
  assert.strictEqual(details.nope, undefined);
  assert.strictEqual(details.supported, undefined);
})();

(function testEnvelopeAndRequestId() {
  const res = makeRes('/v1/image');
  sendError(res, 400, 'invalid_parameter', 'Bad input', {
    details: { field: 'action', allowed_actions: ['format'], forbidden: 'drop' },
  });
  const out = res._result;
  assert.strictEqual(out.statusCode, 400);
  assert.strictEqual(out.payload.status, 'error');
  assert.strictEqual(out.payload.error.code, 'invalid_parameter');
  assert.strictEqual(out.payload.request_id, 'req-123');
  assert.strictEqual(out.payload.error.details.forbidden, undefined);
})();

(function testNormalizeSecurity() {
  const req = { requestId: 'req-1', originalUrl: '/v1/pdf', path: '/v1/pdf', customerKey: { id: 1, user_id: 2, plan_slug: 'pro' } };
  const err = new Error('SELECT * FROM users WHERE token=abc');
  err.code = 'ER_PARSE_ERROR';
  const normalized = normalizeError(err, req, {
    statusCode: 500,
    code: 'pdf_tool_failed',
    message: 'Failed to process the PDF file.',
    details: { reason: 'processing_failed', operation: 'pdf_processing', action: 'merge' },
    component: 'pdf',
    operation: 'pdf_processing',
  });
  assert.strictEqual(normalized.user.code, 'pdf_tool_failed');
  assert.strictEqual(normalized.user.details.reason, 'processing_failed');
  assert.ok(!normalized.user.message.includes('SELECT'));
})();

(function testUploadActionableDetails() {
  const req = {
    requestId: 'req-up-1',
    originalUrl: '/v1/tools',
    path: '/v1/tools',
    customerKey: { id: 99, user_id: 7, plan_slug: 'starter', plan_name: 'Starter', plan_price: '9.99' },
  };
  const err = new Error('too many files');
  const normalized = normalizeError(err, req, {
    statusCode: 413,
    code: 'too_many_files',
    message: 'Too many files were uploaded for your plan limit.',
    details: { allowed: 2, received: 3, field: 'images', endpoint: 'tools', reason: 'upload_validation_failed', operation: 'upload_validation' },
    component: 'upload_limits',
    operation: 'upload_validation',
    stage: 'multer_limit_file_count',
    event: 'upload.limit_exceeded',
    level: 'warn',
  });
  assert.strictEqual(normalized.user.code, 'too_many_files');
  assert.strictEqual(normalized.user.details.allowed, 2);
  assert.strictEqual(normalized.user.details.received, 3);
})();
;

(function testAdminViewerFormatting() {
  const scriptSource = fs.readFileSync(path.join(__dirname, '..', 'admin', 'adminRoutes.js'), 'utf8');
  assert.ok(scriptSource.includes("const lines = ['', separator];"));
  assert.ok(scriptSource.includes("lines.push(separator, '');"));
  assert.ok(scriptSource.includes("return lines.join('\\\\n');"));
})();

console.log('test-error-normalization: OK');
