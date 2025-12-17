#!/usr/bin/env node

const fs = require('fs');

const baseUrl = process.env.REPRO_BASE_URL || 'http://localhost:3005';
const apiKey = process.env.REPRO_API_KEY || process.env.API_KEY;

if (!apiKey) {
  console.error('Set REPRO_API_KEY or API_KEY to a valid key.');
  process.exit(1);
}

const oneByOnePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z/C/HwAFgwJ/lgiV5AAAAABJRU5ErkJggg==',
  'base64'
);

const logFile = 'logs/api-errors.log';

async function callJson(endpoint, body) {
  const res = await fetch(`${baseUrl}${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parsed = text;
  }
  console.log(`\n${endpoint} -> ${res.status}`);
  console.log(parsed);
}

async function callForm(endpoint, fields = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    form.append(key, value);
  });
  const res = await fetch(`${baseUrl}${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    body: form,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parsed = text;
  }
  console.log(`\n${endpoint} -> ${res.status}`);
  console.log(parsed);
}

async function main() {
  await callJson('/v1/h2i', { html: '<div>OK</div>', width: 800, height: 400 });

  await callForm('/v1/image', {
    images: new File([oneByOnePng], 'tiny.png', { type: 'image/png' }),
  });

  await callForm('/v1/pdf', {
    action: 'images_to_pdf',
    images: new File([oneByOnePng], 'tiny.png', { type: 'image/png' }),
  });

  await callForm('/v1/tools', {
    tools: 'exif',
    images: new File([oneByOnePng], 'tiny.png', { type: 'image/png' }),
  });

  if (fs.existsSync(logFile)) {
    const lastLines = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-3).join('\n');
    console.log('\nRecent api-errors.log entries:');
    console.log(lastLines);
  } else {
    console.log('\napi-errors.log not found yet.');
  }
}

main().catch(err => {
  console.error('Repro script failed', err);
  process.exit(1);
});
