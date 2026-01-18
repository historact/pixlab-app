const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const SNAPSHOT_DIR = path.join(os.tmpdir(), 'pixlab-alert-snapshots');
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_CLEAN_INTERVAL_MS = 6 * 60 * 60 * 1000;

let cleanupInterval = null;

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

async function generateAlertSnapshot(ruleId) {
  ensureSnapshotDir();
  const filePath = getSnapshotPath(ruleId);
  const port = process.env.PORT || 3005;
  const token = process.env.SUBSCRIPTION_BRIDGE_TOKEN || '';
  const url = `http://127.0.0.1:${port}/internal/admin/monitoring/snapshot-view?rule_id=${ruleId}&ts=${Date.now()}`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    if (token) {
      await page.setExtraHTTPHeaders({ 'x-davix-bridge-token': token });
    }
    await page.setRequestInterception(true);
    page.on('request', req => {
      try {
        const url = new URL(req.url());
        if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
          return req.abort();
        }
      } catch {
        // Allow data URLs
      }
      return req.continue();
    });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 1280, height: 720 });
    await page.screenshot({ path: filePath, fullPage: true });
  } finally {
    await browser.close();
  }

  return filePath;
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
  generateAlertSnapshot,
  startSnapshotCleanup,
  stopSnapshotCleanup,
};
