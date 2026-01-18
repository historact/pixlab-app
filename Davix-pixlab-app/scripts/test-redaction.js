const assert = require('assert');
const { redactObject } = require('../utils/logRedactor');

const raw = {
  headers: {
    Authorization: 'Bearer supersecrettoken',
    Cookie: 'session_id=abc123; token=secret',
    'x-api-key': 'api-key-1234567890',
  },
  url: 'https://example.com/callback?token=secret-token&code=code123',
  password: 'hunter2',
  session_id_hash: 'stable-session-hash',
  nested: {
    api_key: 'nested-api-key',
    sid: 'session-id',
  },
};

const redacted = redactObject(raw);
const serialized = JSON.stringify(redacted);

const forbidden = ['supersecrettoken', 'secret-token', 'code123', 'hunter2', 'stable-session-hash', 'nested-api-key'];
for (const value of forbidden) {
  assert(!serialized.includes(value), `Expected value to be redacted: ${value}`);
}

console.log('PASS');
