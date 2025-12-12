const crypto = require('crypto');

let argon2 = null;
let bcrypt = null;

try {
  // Optional dependency. Prefer argon2id when available.
  // eslint-disable-next-line global-require
  argon2 = require('argon2');
} catch (err) {
  argon2 = null;
}

try {
  // eslint-disable-next-line global-require
  bcrypt = require('bcrypt');
} catch (err) {
  bcrypt = null;
}

const KEY_PREFIX_LENGTH = 16;
const RANDOM_MIN = 32;
const RANDOM_MAX = 48;

function randomString(length) {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
}

function extractKeyPrefix(plaintextKey) {
  if (!plaintextKey || typeof plaintextKey !== 'string') return null;
  return plaintextKey.slice(0, KEY_PREFIX_LENGTH);
}

async function hashApiKey(plaintextKey) {
  if (argon2) {
    return argon2.hash(plaintextKey, { type: argon2.argon2id });
  }
  if (bcrypt) {
    const rounds = 12;
    return bcrypt.hash(plaintextKey, rounds);
  }
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plaintextKey, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyApiKeyHash(storedHash, plaintextKey) {
  if (!storedHash) return false;

  if (storedHash.startsWith('$argon2')) {
    if (!argon2) throw new Error('argon2 required to verify this key');
    return argon2.verify(storedHash, plaintextKey);
  }

  if (storedHash.startsWith('$2')) {
    if (!bcrypt) throw new Error('bcrypt required to verify this key');
    return bcrypt.compare(plaintextKey, storedHash);
  }

  if (storedHash.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = storedHash.split('$');
    const derived = crypto.scryptSync(plaintextKey, Buffer.from(saltHex, 'hex'), hashHex.length / 2);
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'));
  }

  if (argon2) {
    return argon2.verify(storedHash, plaintextKey);
  }
  if (bcrypt) {
    return bcrypt.compare(plaintextKey, storedHash);
  }

  return false;
}

async function generateApiKey() {
  const length = RANDOM_MIN + Math.floor(Math.random() * (RANDOM_MAX - RANDOM_MIN + 1));
  const randomPart = randomString(length);
  const plaintextKey = `dvx_live_${randomPart}`;
  const prefix = extractKeyPrefix(plaintextKey);
  const keyHash = await hashApiKey(plaintextKey);
  return { plaintextKey, prefix, keyHash };
}

module.exports = {
  generateApiKey,
  extractKeyPrefix,
  hashApiKey,
  verifyApiKeyHash,
};
