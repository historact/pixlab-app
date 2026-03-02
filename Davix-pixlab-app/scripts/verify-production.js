#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');
const { getMigrationStatus, verifySchemaIntegrity, pool, closePool } = require('../db');

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function getPkg() {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function verifyNodeVersion(pkg) {
  const required = pkg.engines?.node;
  assert(required === '22.x', `engines.node must be 22.x, got ${required || 'missing'}`);
  assert(process.versions.node.startsWith('22.'), `Node runtime must be 22.x, got ${process.versions.node}`);
}

function verifyEnv() {
  const required = [
    'NODE_ENV',
    'ADMIN_PASS',
    'ADMIN_PASSWORD_HASH',
    'ADMIN_TOTP_SECRET',
    'ADMIN_SESSION_SECRET',
    'SUBSCRIPTION_BRIDGE_TOKEN',
    'API_KEYS',
    'DB_HOST',
    'DB_USER',
    'DB_NAME',
    'PUBLIC_BASE_URL',
    'INTERNAL_ALLOWED_IPS',
    'SIGNED_URL_SECRET',
    'SIGNED_URL_TTL_SECONDS',
  ];
  for (const name of required) {
    assert((process.env[name] || '').trim(), `missing required env ${name}`);
  }

  assert(process.env.NODE_ENV === 'production', 'NODE_ENV must be production');
  assert(process.env.REQUIRE_SIGNED_OUTPUT_URLS !== 'false', 'REQUIRE_SIGNED_OUTPUT_URLS cannot be false in production');
  assert((process.env.INTERNAL_ALLOWED_IPS || '').split(',').map(v => v.trim()).filter(Boolean).length > 0, 'INTERNAL_ALLOWED_IPS cannot be empty in production');
  assert(process.env.PUPPETEER_NO_SANDBOX !== 'true', 'PUPPETEER_NO_SANDBOX cannot be true in production');
}

function commandOk(name, args) {
  const result = spawnSync(name, args, { stdio: 'pipe' });
  return result.status === 0;
}

async function verifySchema() {
  const status = await getMigrationStatus();
  assert(!status.pending.length, `pending migrations: ${status.pending.join(', ')}`);
  assert(!status.health.partialEntries.length, `partial migrations: ${status.health.partialEntries.join(', ')}`);
  const conn = await pool.getConnection();
  try {
    await verifySchemaIntegrity(conn);
  } finally {
    conn.release();
  }
}

async function verifySharp() {
  const sharp = require('sharp');
  const input = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=',
    'base64'
  );
  const out = await sharp(input).resize(1, 1).png().toBuffer();
  assert(Buffer.isBuffer(out) && out.length > 0, 'sharp transform failed');
}

function verifyPuppeteerExecutable() {
  const puppeteer = require('puppeteer');
  const executable = puppeteer.executablePath();
  assert(executable && fs.existsSync(executable), `puppeteer executable not found at ${executable}`);
}

async function request(urlString, options = {}) {
  const target = new URL(urlString);
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      target,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

(async () => {
  try {
    const pkg = getPkg();
    verifyNodeVersion(pkg);
    verifyEnv();

    assert(commandOk('qpdf', ['--version']), 'qpdf unavailable');
    assert(commandOk('pdftoppm', ['-v']), 'pdftoppm unavailable');

    await verifySchema();
    await verifySharp();
    verifyPuppeteerExecutable();

    const baseUrl = process.env.VERIFY_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
    const health = await request(`${baseUrl}/health`);
    assert(health.status === 200, `/health failed with status ${health.status}`);

    const ping = await request(`${baseUrl}/internal/ping`, {
      headers: {
        'x-davix-bridge-token': process.env.SUBSCRIPTION_BRIDGE_TOKEN,
      },
    });
    assert(ping.status === 200, `/internal/ping failed with status ${ping.status}`);

    console.log('Production verification passed.');
    process.exit(0);
  } catch (err) {
    console.error('Production verification failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
