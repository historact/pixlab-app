#!/usr/bin/env node
/*
 * PixLab production smoke checks.
 *
 * Usage:
 *   PUBLIC_BASE_URL=http://127.0.0.1:3005 SMOKE_API_KEY=owner_key node scripts/prod-smoke.js
 *
 * This script validates environment and startup dependencies, then runs local
 * HTTP smoke tests against an already-running PixLab server.
 */

const { execFile } = require('child_process');
const { validateEnv } = require('../utils/validateEnv');
const { checkStartupDependencies } = require('../utils/startupDependencies');
const { getRequireSignedOutputUrls } = require('../utils/config');

const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const apiKey = String(process.env.SMOKE_API_KEY || '')
  .split(/[\s,]+/)
  .map(v => v.trim())
  .find(Boolean);

function pass(name, detail = '') {
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isSignedUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has('exp') && parsed.searchParams.has('sig');
  } catch (err) {
    return false;
  }
}

function commandExists(command, args) {
  return new Promise(resolve => {
    execFile(command, args, error => {
      resolve(!error);
    });
  });
}

async function assertRequiredDependencies() {
  const checks = [
    { name: 'qpdf', args: ['--version'] },
    { name: 'pdftoppm', args: ['-v'] },
  ];
  const missing = [];
  for (const check of checks) {
    const present = await commandExists(check.name, check.args);
    if (!present) missing.push(check.name);
  }
  if (missing.length) {
    throw new Error(`Missing required dependencies: ${missing.join(', ')}`);
  }
}


function createTinyPngBlob() {
  const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2WZ6kAAAAASUVORK5CYII=';
  return new Blob([Buffer.from(tinyPngBase64, 'base64')], { type: 'image/png' });
}

async function createTinyPdfBlob() {
  const tinyPdf = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 18 Tf 50 100 Td (PixLab Smoke) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000122 00000 n 
0000000248 00000 n 
0000000342 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
412
%%EOF
`;
  return new Blob([Buffer.from(tinyPdf, 'utf8')], { type: 'application/pdf' });
}

async function ensureServerReachable() {
  if (!baseUrl) {
    console.error('Start server first: PUBLIC_BASE_URL is required.');
    process.exit(1);
  }

  try {
    await fetch(`${baseUrl}/health`);
  } catch (err) {
    console.error('Start server first');
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  }
}

async function fetchOutputAndValidate(name, outputUrl, expectedContentTypePrefix) {
  const response = await fetch(outputUrl);
  assert(response.status === 200, `${name}: output fetch status was ${response.status}`);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  assert(
    contentType.startsWith(expectedContentTypePrefix),
    `${name}: unexpected content-type ${contentType} (expected prefix ${expectedContentTypePrefix})`
  );
  const body = Buffer.from(await response.arrayBuffer());
  assert(body.length > 0, `${name}: output response body was empty`);
  pass(`${name} output fetch`, `content-type=${contentType}; bytes=${body.length}`);
}

async function run() {
  console.log('PixLab prod smoke checks starting...');
  console.log(`Target PUBLIC_BASE_URL=${baseUrl || '(missing)'}`);

  const { errors } = validateEnv();
  if (errors.length) {
    console.error('Environment validation failed before smoke checks:');
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }
  pass('env validation');

  try {
    await checkStartupDependencies({ logger: console });
    await assertRequiredDependencies();
    pass('startup dependency check', 'qpdf + pdftoppm available');
  } catch (err) {
    fail('startup dependency check', err.message);
    process.exit(1);
  }

  await ensureServerReachable();

  if (!apiKey) {
    fail('api key resolution', 'Set SMOKE_API_KEY, API_KEY, or API_KEYS.');
    process.exit(1);
  }

  const signingRequired = getRequireSignedOutputUrls();

  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = await healthRes.json();
    assert(healthRes.ok, `/health status was ${healthRes.status}`);
    assert(['ok', 'degraded'].includes(healthJson.status), 'health status must be ok or degraded');
    assert(Boolean(healthJson.request_id), 'health response missing request_id');
    pass('GET /health', `status=${healthJson.status}`);
  } catch (err) {
    fail('GET /health', err.message);
    process.exit(1);
  }

  try {
    const h2iRes = await fetch(`${baseUrl}/v1/h2i`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        action: 'image',
        html: '<div style="font-size:24px">PixLab Smoke</div>',
        width: 256,
        height: 128,
        format: 'png',
      }),
    });
    const h2iJson = await h2iRes.json();
    assert(h2iRes.ok, `/v1/h2i status was ${h2iRes.status}`);
    assert(typeof h2iJson.url === 'string', '/v1/h2i missing output url');
    if (signingRequired) {
      assert(isSignedUrl(h2iJson.url), '/v1/h2i output URL is not signed (missing exp/sig)');
    }
    pass('POST /v1/h2i', signingRequired ? 'signed url verified' : 'success');
    await fetchOutputAndValidate('/v1/h2i', h2iJson.url, 'image/');
  } catch (err) {
    fail('POST /v1/h2i', err.message);
    process.exit(1);
  }


  try {
    const h2iDataRes = await fetch(`${baseUrl}/v1/h2i`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        action: 'image',
        html: '<img alt="data" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2WZ6kAAAAASUVORK5CYII=" />',
        width: 64,
        height: 64,
        format: 'png',
      }),
    });
    const h2iDataJson = await h2iDataRes.json();
    assert(h2iDataRes.ok, `/v1/h2i data-url status was ${h2iDataRes.status}`);
    assert(typeof h2iDataJson.url === 'string', '/v1/h2i data-url missing output url');
    if (signingRequired) {
      assert(isSignedUrl(h2iDataJson.url), '/v1/h2i data-url output URL is not signed (missing exp/sig)');
    }
    pass('POST /v1/h2i (data URL)', signingRequired ? 'signed url verified' : 'success');
    await fetchOutputAndValidate('/v1/h2i (data URL)', h2iDataJson.url, 'image/');
  } catch (err) {
    fail('POST /v1/h2i (data URL)', err.message);
    process.exit(1);
  }

  try {
    const imageForm = new FormData();
    imageForm.append('action', 'format');
    imageForm.append('format', 'png');
    imageForm.append('images', createTinyPngBlob(), 'tiny.png');

    const imageRes = await fetch(`${baseUrl}/v1/image`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: imageForm,
    });
    const imageJson = await imageRes.json();
    assert(imageRes.ok, `/v1/image status was ${imageRes.status}`);
    assert(Array.isArray(imageJson.results) && imageJson.results.length > 0, '/v1/image returned no results');
    const imageUrl = imageJson.results[0].url;
    assert(typeof imageUrl === 'string', '/v1/image result missing url');
    assert(new URL(imageUrl).pathname.startsWith('/image/'), '/v1/image url path must begin with /image/');
    if (signingRequired) {
      assert(isSignedUrl(imageUrl), '/v1/image output URL is not signed (missing exp/sig)');
    }
    pass('POST /v1/image', signingRequired ? 'signed /image url verified' : 'success');
    await fetchOutputAndValidate('/v1/image', imageUrl, 'image/');

    const imgEditUrl = new URL(imageUrl);
    imgEditUrl.pathname = imgEditUrl.pathname.replace('/image/', '/img-edit/');
    const aliasRes = await fetch(imgEditUrl.toString());
    assert(aliasRes.status === 200, `/img-edit alias fetch status was ${aliasRes.status}`);
    const aliasType = (aliasRes.headers.get('content-type') || '').toLowerCase();
    assert(aliasType.startsWith('image/'), `/img-edit alias content-type was ${aliasType}`);
    const aliasBody = Buffer.from(await aliasRes.arrayBuffer());
    assert(aliasBody.length > 0, '/img-edit alias body was empty');
    pass('GET /img-edit alias', `content-type=${aliasType}; bytes=${aliasBody.length}`);
  } catch (err) {
    fail('POST /v1/image', err.message);
    process.exit(1);
  }

  try {
    const pdfForm = new FormData();
    pdfForm.append('action', 'to-images');
    pdfForm.append('pages', 'first');
    pdfForm.append('toFormat', 'png');
    pdfForm.append('file', await createTinyPdfBlob(), 'tiny.pdf');

    const pdfRes = await fetch(`${baseUrl}/v1/pdf`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: pdfForm,
    });
    const pdfJson = await pdfRes.json();
    assert(pdfRes.ok, `/v1/pdf status was ${pdfRes.status}`);
    assert(Array.isArray(pdfJson.results) && pdfJson.results.length > 0, '/v1/pdf returned no results for to-images');
    const pdfUrl = pdfJson.results[0].url;
    assert(typeof pdfUrl === 'string', '/v1/pdf to-images result missing url');
    if (signingRequired) {
      assert(isSignedUrl(pdfUrl), '/v1/pdf output URL is not signed (missing exp/sig)');
    }
    pass('POST /v1/pdf (to-images)', signingRequired ? 'signed url verified' : 'success');
    await fetchOutputAndValidate('/v1/pdf (to-images)', pdfUrl, 'image/');
  } catch (err) {
    fail('POST /v1/pdf (to-images)', err.message);
    process.exit(1);
  }

  console.log('PASS all smoke checks');
}

run().catch(err => {
  console.error('FAIL prod smoke script', err?.message || err);
  process.exit(1);
});
