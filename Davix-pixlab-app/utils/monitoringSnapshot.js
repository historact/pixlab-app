const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const {
  dur,
  log: logSnapshot,
  nowMs,
} = require('./internal/debugSnapshotLogger');
const { getPuppeteerNoSandbox } = require('./config');

const SNAPSHOT_DIR = path.join(os.tmpdir(), 'pixlab-alert-snapshots');
const SNAPSHOT_TTL_MS = Math.max(1, Number.parseInt(process.env.MONITORING_SNAPSHOTS_RETENTION_HOURS, 10) || (7 * 24)) * 60 * 60 * 1000;
const SNAPSHOT_CLEAN_INTERVAL_MS = Math.max(1000, Number.parseInt(process.env.MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS, 10) || (6 * 60 * 60 * 1000));

let cleanupInterval = null;

function normalizeForwardedValue(value) {
  if (!value) return null;
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized !== 'string') return null;
  return normalized.split(',')[0].trim();
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

function resolveSnapshotBaseUrl(req) {
  const snapshotBaseUrl = normalizeBaseUrl(process.env.SNAPSHOT_BASE_URL);
  if (snapshotBaseUrl) {
    return { baseUrl: snapshotBaseUrl, source: 'snapshot_env' };
  }
  const publicBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
  if (publicBaseUrl) {
    return { baseUrl: publicBaseUrl, source: 'public_env' };
  }
  const internalBaseUrl = normalizeBaseUrl(process.env.INTERNAL_BASE_URL);
  if (internalBaseUrl) {
    return { baseUrl: internalBaseUrl, source: 'internal_env' };
  }
  const explicitBaseUrl = normalizeBaseUrl(process.env.BASE_URL);
  if (explicitBaseUrl) {
    return { baseUrl: explicitBaseUrl, source: 'base_env' };
  }
  if (req) {
    const protoHeader = normalizeForwardedValue(req.headers?.['x-forwarded-proto']);
    const hostHeader = normalizeForwardedValue(req.headers?.['x-forwarded-host']) || req.headers?.host;
    const proto = protoHeader || req.protocol || 'https';
    let host = hostHeader || '';
    if (host && !host.includes(':') && process.env.SNAPSHOT_FORCE_PORT) {
      host = `${host}:${process.env.SNAPSHOT_FORCE_PORT}`;
    }
    host = host.replace(/:(80|443)$/, '');
    return { baseUrl: normalizeBaseUrl(`${proto}://${host}`), source: 'headers' };
  }
  const port = process.env.PORT || 3005;
  return { baseUrl: normalizeBaseUrl(`http://localhost:${port}`), source: 'default' };
}

function buildSnapshotUrl(ruleId, { req = null, view = true } = {}) {
  const { baseUrl } = resolveSnapshotBaseUrl(req);
  const endpoint = view ? 'snapshot-view' : 'snapshot';
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/internal/admin/monitoring/${endpoint}?rule_id=${encodeURIComponent(ruleId)}&ts=${Date.now()}`;
}

async function fetchSnapshotImageBuffer(snapshotUrl, { requestId = null, ruleId = null } = {}) {
  if (!snapshotUrl) {
    return { ok: false, error: 'missing_snapshot_url' };
  }
  const headers = {};
  if (process.env.SUBSCRIPTION_BRIDGE_TOKEN) {
    headers['x-davix-bridge-token'] = process.env.SUBSCRIPTION_BRIDGE_TOKEN;
  }
  const startedAt = nowMs();
  logSnapshot('snapshot.fetch.start', {
    request_id: requestId,
    rule_id: ruleId,
    url: snapshotUrl,
  });
  try {
    const res = await fetch(snapshotUrl, { headers });
    const contentType = res.headers.get('content-type') || null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logSnapshot('snapshot.fetch.result', {
      request_id: requestId,
      rule_id: ruleId,
      url: snapshotUrl,
      status: res.status,
      content_type: contentType,
      bytes_length: buffer.length,
      duration_ms: dur(startedAt),
    });
    if (!res.ok || !buffer.length) {
      return { ok: false, error: res.ok ? 'empty_snapshot' : `http_${res.status}` };
    }
    if (contentType && !contentType.startsWith('image/')) {
      return { ok: false, error: `invalid_content_type_${contentType}` };
    }
    return { ok: true, buffer, contentType: contentType || 'image/png' };
  } catch (err) {
    logSnapshot('snapshot.fetch.result', {
      request_id: requestId,
      rule_id: ruleId,
      url: snapshotUrl,
      status: null,
      content_type: null,
      bytes_length: 0,
      duration_ms: dur(startedAt),
      error: err?.message || 'snapshot_fetch_failed',
    }, 'error');
    return { ok: false, error: err?.message || 'snapshot_fetch_failed' };
  }
}

function ensureSnapshotDir() {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function getSnapshotPath(ruleId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(SNAPSHOT_DIR, `alert-${ruleId}-${stamp}.png`);
}

function buildSparkline(points, width = 320, height = 80) {
  if (!points.length) return '';
  const values = points.map(point => point[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(points.length - 1, 1);
  const pathData = values
    .map((value, idx) => {
      const x = idx * step;
      const y = height - ((value - min) / range) * height;
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <path d="${pathData}" fill="none" stroke="#38bdf8" stroke-width="2" />
  </svg>`;
}

function renderSnapshotHtml({ snapshot, series }) {
  const uptime = Math.floor(snapshot.process.uptime_sec || 0);
  const perEndpointRows = Object.entries(snapshot.endpoints || {})
    .map(([key, stats]) => `
      <tr>
        <td>${key.toUpperCase()}</td>
        <td>${stats.per_minute.toFixed(2)}</td>
        <td>${(stats.error_rate * 100).toFixed(2)}%</td>
        <td>${stats.avg_latency_ms.toFixed(1)}</td>
        <td>${stats.p95_latency_ms.toFixed(1)}</td>
      </tr>
    `)
    .join('');
  const queues = snapshot.queues || {};
  const queueCards = Object.entries(queues)
    .map(([key, stats]) => `
      <div class="mini-card">
        <div class="mini-title">${key.toUpperCase()}</div>
        <div>Active: ${stats.active}</div>
        <div>Queued: ${stats.queued}</div>
      </div>
    `)
    .join('');

  const chartPoints = (metricKey, mapper) =>
    series.map(bucket => [bucket.ts, mapper(bucket)]);

  const reqSeries = buildSparkline(
    chartPoints('req', bucket => (bucket.total.count / 10) * 60)
  );
  const errSeries = buildSparkline(
    chartPoints('err', bucket => (bucket.total.errors / 10) * 60)
  );
  const latencySeries = buildSparkline(
    chartPoints('lat', bucket => {
      const samples = bucket.total.latency_samples || [];
      if (!samples.length) return 0;
      const sum = samples.reduce((acc, val) => acc + val, 0);
      return sum / samples.length;
    })
  );

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>PixLab Monitoring Snapshot</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
      h1 { margin: 0 0 16px; font-size: 20px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      .card { background: #111827; padding: 16px; border-radius: 10px; border: 1px solid #1f2937; }
      .stat { font-size: 20px; font-weight: 600; }
      .label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
      .charts { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); margin-top: 16px; }
      .table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
      .table th, .table td { padding: 6px 8px; border-bottom: 1px solid #1f2937; text-align: left; }
      .mini-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
      .mini-card { background: #0b1220; padding: 10px; border-radius: 8px; border: 1px solid #1f2937; font-size: 12px; }
      .mini-title { font-weight: 600; margin-bottom: 6px; }
    </style>
  </head>
  <body>
    <h1>PixLab Monitoring Snapshot</h1>
    <div class="grid">
      <div class="card"><div class="stat">${snapshot.process.cpu_percent.toFixed(1)}%</div><div class="label">CPU</div></div>
      <div class="card"><div class="stat">${(snapshot.process.memory_rss_bytes / 1024 / 1024).toFixed(1)} MB</div><div class="label">RSS</div></div>
      <div class="card"><div class="stat">${(snapshot.process.heap_used_bytes / 1024 / 1024).toFixed(1)} / ${(snapshot.process.heap_total_bytes / 1024 / 1024).toFixed(1)} MB</div><div class="label">Heap</div></div>
      <div class="card"><div class="stat">${snapshot.process.event_loop_delay_ms.toFixed(1)} ms</div><div class="label">Event loop delay</div></div>
      <div class="card"><div class="stat">${uptime}s</div><div class="label">Uptime</div></div>
      <div class="card"><div class="stat">${snapshot.db.status}</div><div class="label">DB status</div></div>
      <div class="card"><div class="stat">${snapshot.requests.per_minute_global.toFixed(1)}</div><div class="label">Req/min</div></div>
      <div class="card"><div class="stat">${snapshot.requests.errors_per_minute.toFixed(1)}</div><div class="label">Errors/min</div></div>
      <div class="card"><div class="stat">${snapshot.requests.timeouts_per_minute.toFixed(1)}</div><div class="label">Timeouts/min</div></div>
    </div>

    <div class="charts">
      <div class="card"><div class="label">Requests/min (last 15m)</div>${reqSeries}</div>
      <div class="card"><div class="label">Errors/min (last 15m)</div>${errSeries}</div>
      <div class="card"><div class="label">Latency avg (last 15m)</div>${latencySeries}</div>
    </div>

    <div class="card">
      <div class="label">Queues</div>
      <div class="mini-grid">${queueCards}</div>
    </div>

    <div class="card">
      <div class="label">Endpoints</div>
      <table class="table">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Req/min</th>
            <th>Error rate</th>
            <th>Avg latency (ms)</th>
            <th>P95 latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${perEndpointRows}
        </tbody>
      </table>
    </div>
  </body>
  </html>`;
}

async function generateAlertSnapshot(ruleId, options = {}) {
  const requestId = options.requestId || options.request_id || null;
  const request = options.req || null;
  const ruleIdValue = ruleId;
  const startedAt = nowMs();
  ensureSnapshotDir();
  const filePath = getSnapshotPath(ruleId);
  const { baseUrl, source: baseUrlSource } = resolveSnapshotBaseUrl(request);
  const token = process.env.SUBSCRIPTION_BRIDGE_TOKEN || '';
  const url = buildSnapshotUrl(ruleId, { req: request, view: true });
  const snapshotImageUrl = buildSnapshotUrl(ruleId, { req: request, view: false });
  const allowDirectFetch = options.allowDirectFetch !== false;
  let failedStage = 'init';

  logSnapshot('snapshot.start', {
    request_id: requestId,
    rule_id: ruleIdValue,
    base_url: baseUrl,
    output_path: filePath,
  });
  logSnapshot('snapshot.base_url.resolve', {
    request_id: requestId,
    rule_id: ruleIdValue,
    base_url: baseUrl,
    source: baseUrlSource,
  });

  if (allowDirectFetch) {
    const fetchResult = await fetchSnapshotImageBuffer(snapshotImageUrl, { requestId, ruleId: ruleIdValue });
    if (fetchResult.ok) {
      logSnapshot('snapshot.fallback.used', {
        request_id: requestId,
        rule_id: ruleIdValue,
        direct_fetch: true,
        reason: 'direct_fetch_preferred',
      });
      return {
        buffer: fetchResult.buffer,
        contentType: fetchResult.contentType,
        filename: 'monitoring.png',
        filePath: null,
        snapshotUrlPublicFallback: url,
        source: 'direct_fetch',
      };
    }
  }

  let puppeteerVersion = null;
  try {
    puppeteerVersion = typeof puppeteer?.version === 'function' ? puppeteer.version() : null;
  } catch {
    puppeteerVersion = null;
  }
  logSnapshot('puppeteer.detect', {
    request_id: requestId,
    rule_id: ruleIdValue,
    available: Boolean(puppeteer),
    version: puppeteerVersion,
  });
  logSnapshot('chromium.path', {
    request_id: requestId,
    rule_id: ruleIdValue,
    executable_path: typeof puppeteer?.executablePath === 'function' ? puppeteer.executablePath() : null,
    env_puppeteer_executable_path: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    env_puppeteer_no_sandbox: process.env.PUPPETEER_NO_SANDBOX || null,
  });

  let browser;
  let page;
  const launchStart = nowMs();
  try {
    failedStage = 'browser.launch';
    logSnapshot('browser.launch.start', { request_id: requestId, rule_id: ruleIdValue });
    const launchArgs = getPuppeteerNoSandbox() ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
    browser = await puppeteer.launch({ args: launchArgs });
    logSnapshot('browser.launch.ok', {
      request_id: requestId,
      rule_id: ruleIdValue,
      duration_ms: dur(launchStart),
    });
  } catch (err) {
    logSnapshot('browser.launch.error', {
      request_id: requestId,
      rule_id: ruleIdValue,
      duration_ms: dur(launchStart),
      failed_stage: failedStage,
      error_name: err?.name,
      error_message: err?.message,
      error_stack: err?.stack,
    }, 'error');
    err.failed_stage = failedStage;
    throw err;
  }
  try {
    const newPageStart = nowMs();
    failedStage = 'page.new';
    logSnapshot('page.new.start', { request_id: requestId, rule_id: ruleIdValue });
    page = await browser.newPage();
    logSnapshot('page.new.ok', {
      request_id: requestId,
      rule_id: ruleIdValue,
      duration_ms: dur(newPageStart),
    });
    if (token) {
      await page.setExtraHTTPHeaders({ 'x-davix-bridge-token': token });
    }
    page.on('console', msg => {
      logSnapshot('page.console', {
        request_id: requestId,
        rule_id: ruleIdValue,
        type: msg.type(),
        text: msg.text(),
      });
    });
    page.on('pageerror', err => {
      logSnapshot('page.pageerror', {
        request_id: requestId,
        rule_id: ruleIdValue,
        error_name: err?.name,
        error_message: err?.message,
        error_stack: err?.stack,
      }, 'error');
    });
    await page.setRequestInterception(true);
    page.on('request', req => {
      try {
        const url = new URL(req.url());
        const allowedHosts = new Set(['127.0.0.1', 'localhost']);
        const baseHost = (() => {
          try {
            return new URL(baseUrl).hostname;
          } catch {
            return null;
          }
        })();
        if (baseHost) allowedHosts.add(baseHost);
        if (!allowedHosts.has(url.hostname)) {
          return req.abort();
        }
      } catch {
        // Allow data URLs
      }
      return req.continue();
    });
    const gotoStart = nowMs();
    failedStage = 'page.goto';
    logSnapshot('page.goto.start', {
      request_id: requestId,
      rule_id: ruleIdValue,
      url,
      wait_until: 'networkidle0',
      timeout_ms: 30000,
    });
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    logSnapshot('page.goto.ok', {
      request_id: requestId,
      rule_id: ruleIdValue,
      duration_ms: dur(gotoStart),
      final_url: page.url(),
      response_status: response?.status?.() ?? null,
    });
    failedStage = 'page.viewport';
    await page.setViewport({ width: 1280, height: 720 });
    const screenshotStart = nowMs();
    failedStage = 'page.screenshot';
    logSnapshot('page.screenshot.start', {
      request_id: requestId,
      rule_id: ruleIdValue,
      path: filePath,
      full_page: true,
      type: 'png',
    });
    await page.screenshot({ path: filePath, fullPage: true });
    const stats = fs.statSync(filePath);
    logSnapshot('page.screenshot.ok', {
      request_id: requestId,
      rule_id: ruleIdValue,
      duration_ms: dur(screenshotStart),
      bytes: stats.size,
    });
  } catch (err) {
    if (failedStage === 'page.goto') {
      logSnapshot('snapshot.puppeteer.goto.fail', {
        request_id: requestId,
        rule_id: ruleIdValue,
        url,
        error_name: err?.name,
        error_message: err?.message,
        error_stack: err?.stack,
      }, 'error');
    }
    logSnapshot('snapshot.error', {
      request_id: requestId,
      rule_id: ruleIdValue,
      failed_stage: failedStage,
      error_name: err?.name,
      error_message: err?.message,
      error_stack: err?.stack,
    }, 'error');
    if (allowDirectFetch) {
      const fetchResult = await fetchSnapshotImageBuffer(snapshotImageUrl, { requestId, ruleId: ruleIdValue });
      if (fetchResult.ok) {
        logSnapshot('snapshot.fallback.used', {
          request_id: requestId,
          rule_id: ruleIdValue,
          direct_fetch: true,
          reason: 'puppeteer_failed',
          failed_stage: failedStage,
        });
        return {
          buffer: fetchResult.buffer,
          contentType: fetchResult.contentType,
          filename: 'monitoring.png',
          filePath: null,
          snapshotUrlPublicFallback: url,
          source: 'direct_fetch_fallback',
        };
      }
    }
    err.failed_stage = failedStage;
    throw err;
  } finally {
    const closeStart = nowMs();
    failedStage = 'browser.close';
    if (browser) {
      try {
        await browser.close();
        logSnapshot('browser.close.ok', {
          request_id: requestId,
          rule_id: ruleIdValue,
          duration_ms: dur(closeStart),
        });
      } catch (err) {
        logSnapshot('browser.close.error', {
          request_id: requestId,
          rule_id: ruleIdValue,
          duration_ms: dur(closeStart),
          failed_stage: failedStage,
          error_name: err?.name,
          error_message: err?.message,
          error_stack: err?.stack,
        }, 'error');
      }
    }
  }

  const finalStats = fs.statSync(filePath);
  logSnapshot('snapshot.complete', {
    request_id: requestId,
    rule_id: ruleIdValue,
    duration_ms: dur(startedAt),
    bytes: finalStats.size,
    output_path: filePath,
  });
  const buffer = await fs.promises.readFile(filePath);
  return {
    buffer,
    contentType: 'image/png',
    filename: path.basename(filePath),
    filePath,
    snapshotUrlPublicFallback: url,
    source: 'puppeteer',
  };
}

function cleanupSnapshots() {
  ensureSnapshotDir();
  const now = Date.now();
  for (const file of fs.readdirSync(SNAPSHOT_DIR)) {
    const fullPath = path.join(SNAPSHOT_DIR, file);
    try {
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > SNAPSHOT_TTL_MS) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // ignore
    }
  }
}

function startSnapshotCleanup() {
  if (cleanupInterval) return;
  cleanupSnapshots();
  cleanupInterval = setInterval(cleanupSnapshots, SNAPSHOT_CLEAN_INTERVAL_MS);
}

function stopSnapshotCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  renderSnapshotHtml,
  resolveSnapshotBaseUrl,
  buildSnapshotUrl,
  generateAlertSnapshot,
  startSnapshotCleanup,
  stopSnapshotCleanup,
};
