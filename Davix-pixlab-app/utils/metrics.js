const os = require('os');
const { monitorEventLoopDelay } = require('perf_hooks');
const { query } = require('../db');

const DEFAULT_BUCKET_SEC = 10;
const DEFAULT_RETENTION_SEC = 6 * 60 * 60;
const LATENCY_SAMPLE_LIMIT = 200;
const RATE_WINDOW_SEC = 60;

const endpoints = ['h2i', 'image', 'pdf', 'tools', 'health', 'internal', 'admin', 'other'];
const semaphoreRegistry = new Map();

let bucketSec = DEFAULT_BUCKET_SEC;
let ringSize = Math.ceil(DEFAULT_RETENTION_SEC / DEFAULT_BUCKET_SEC);
let ring = [];
let ringIndex = 0;
let initialized = false;
let metricsInterval = null;
let dbInterval = null;
let cpuInterval = null;
let eventLoopHistogram = null;
let lastDbStatus = { status: 'unknown', checked_at: null };
let lastCpu = { percent: 0, timestamp: Date.now() };

const current = createEmptyBucket();

function createEndpointStats() {
  return {
    count: 0,
    errors: 0,
    timeouts: 0,
    latency_sum_ms: 0,
    latency_samples: [],
  };
}

function createEmptyBucket() {
  const perEndpoint = {};
  endpoints.forEach(key => {
    perEndpoint[key] = createEndpointStats();
  });
  return {
    ts: Date.now(),
    total: createEndpointStats(),
    perEndpoint,
  };
}

function resetCurrentBucket() {
  current.ts = Date.now();
  current.total = createEndpointStats();
  endpoints.forEach(key => {
    current.perEndpoint[key] = createEndpointStats();
  });
}

function ensureInitialized() {
  if (initialized) return;
  ring = Array.from({ length: ringSize }, () => createEmptyBucket());
  initialized = true;
}

function registerSemaphore(name, semaphore) {
  if (!name || !semaphore || typeof semaphore.getStats !== 'function') return;
  semaphoreRegistry.set(name, semaphore);
}

function resolveEndpointKey(path, adminBase) {
  if (!path) return 'other';
  if (path.startsWith('/v1/h2i')) return 'h2i';
  if (path.startsWith('/v1/image')) return 'image';
  if (path.startsWith('/v1/pdf')) return 'pdf';
  if (path.startsWith('/v1/tools')) return 'tools';
  if (path.startsWith('/health')) return 'health';
  if (path.startsWith('/internal/')) return 'internal';
  if (adminBase && path.startsWith(adminBase)) return 'admin';
  return 'other';
}

function recordRequest({ endpoint, durationMs, statusCode }) {
  ensureInitialized();
  const key = endpoints.includes(endpoint) ? endpoint : 'other';
  const isError = Number(statusCode) >= 400;

  const endpointStats = current.perEndpoint[key];
  endpointStats.count += 1;
  endpointStats.latency_sum_ms += durationMs;
  if (isError) endpointStats.errors += 1;
  pushLatencySample(endpointStats.latency_samples, durationMs);

  current.total.count += 1;
  current.total.latency_sum_ms += durationMs;
  if (isError) current.total.errors += 1;
  pushLatencySample(current.total.latency_samples, durationMs);
}

function recordTimeout(endpoint) {
  ensureInitialized();
  const key = endpoints.includes(endpoint) ? endpoint : 'other';
  current.perEndpoint[key].timeouts += 1;
  current.total.timeouts += 1;
}

function pushLatencySample(samples, value) {
  if (!Number.isFinite(value)) return;
  if (samples.length >= LATENCY_SAMPLE_LIMIT) {
    samples.shift();
  }
  samples.push(value);
}

function bucketize() {
  ensureInitialized();
  ringIndex = (ringIndex + 1) % ringSize;
  ring[ringIndex] = {
    ts: current.ts,
    total: cloneStats(current.total),
    perEndpoint: clonePerEndpoint(current.perEndpoint),
  };
  resetCurrentBucket();
}

function cloneStats(stats) {
  return {
    count: stats.count,
    errors: stats.errors,
    timeouts: stats.timeouts,
    latency_sum_ms: stats.latency_sum_ms,
    latency_samples: [...stats.latency_samples],
  };
}

function clonePerEndpoint(perEndpoint) {
  const output = {};
  endpoints.forEach(key => {
    output[key] = cloneStats(perEndpoint[key]);
  });
  return output;
}

function getRecentBuckets(windowSec = RATE_WINDOW_SEC) {
  ensureInitialized();
  const bucketsNeeded = Math.ceil(windowSec / bucketSec);
  const results = [];
  for (let i = 0; i < bucketsNeeded; i += 1) {
    const index = (ringIndex - i + ringSize) % ringSize;
    results.push(ring[index]);
  }
  return results;
}

function aggregateLatency(samples) {
  if (!samples.length) return { avg: 0, p95: 0 };
  const sum = samples.reduce((acc, val) => acc + val, 0);
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    avg: sum / samples.length,
    p95: sorted[idx],
  };
}

function computeRates(windowSec = RATE_WINDOW_SEC) {
  const buckets = getRecentBuckets(windowSec);
  const windowMs = windowSec * 1000;
  const total = createEndpointStats();
  const perEndpoint = {};
  endpoints.forEach(key => {
    perEndpoint[key] = createEndpointStats();
  });

  for (const bucket of buckets) {
    if (!bucket) continue;
    total.count += bucket.total.count;
    total.errors += bucket.total.errors;
    total.timeouts += bucket.total.timeouts;
    total.latency_sum_ms += bucket.total.latency_sum_ms;
    total.latency_samples.push(...bucket.total.latency_samples);
    endpoints.forEach(key => {
      perEndpoint[key].count += bucket.perEndpoint[key].count;
      perEndpoint[key].errors += bucket.perEndpoint[key].errors;
      perEndpoint[key].timeouts += bucket.perEndpoint[key].timeouts;
      perEndpoint[key].latency_sum_ms += bucket.perEndpoint[key].latency_sum_ms;
      perEndpoint[key].latency_samples.push(...bucket.perEndpoint[key].latency_samples);
    });
  }

  const totalLatency = aggregateLatency(total.latency_samples);
  const endpointLatency = {};
  endpoints.forEach(key => {
    endpointLatency[key] = aggregateLatency(perEndpoint[key].latency_samples);
  });

  return {
    window_sec: windowSec,
    per_minute_global: windowMs ? (total.count / windowMs) * 60000 : 0,
    errors_per_minute: windowMs ? (total.errors / windowMs) * 60000 : 0,
    timeouts_per_minute: windowMs ? (total.timeouts / windowMs) * 60000 : 0,
    error_rate_global: total.count ? total.errors / total.count : 0,
    total_latency: totalLatency,
    per_endpoint: endpoints.reduce((acc, key) => {
      const stats = perEndpoint[key];
      const latency = endpointLatency[key];
      acc[key] = {
        count: stats.count,
        errors: stats.errors,
        errors_per_min: windowMs ? (stats.errors / windowMs) * 60000 : 0,
        timeouts_per_min: windowMs ? (stats.timeouts / windowMs) * 60000 : 0,
        error_rate: stats.count ? stats.errors / stats.count : 0,
        per_minute: windowMs ? (stats.count / windowMs) * 60000 : 0,
        avg_latency_ms: latency.avg || 0,
        p95_latency_ms: latency.p95 || 0,
      };
      return acc;
    }, {}),
  };
}

function getProcessMetrics() {
  const memory = process.memoryUsage();
  const uptimeSec = process.uptime();
  const eventLoopDelayMs = eventLoopHistogram ? eventLoopHistogram.mean / 1e6 : 0;
  const cpuPercent = lastCpu.percent;
  return {
    uptime_sec: uptimeSec,
    cpu_percent: cpuPercent,
    memory_rss_bytes: memory.rss,
    heap_used_bytes: memory.heapUsed,
    heap_total_bytes: memory.heapTotal,
    event_loop_delay_ms: eventLoopDelayMs,
  };
}

function getQueueStats() {
  const queues = {};
  for (const [name, semaphore] of semaphoreRegistry.entries()) {
    queues[name] = semaphore.getStats();
  }
  return queues;
}

async function checkDbStatus() {
  try {
    const rows = await query('SELECT 1 AS ok');
    lastDbStatus = {
      status: rows?.[0]?.ok === 1 ? 'up' : 'unknown',
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    lastDbStatus = {
      status: 'down',
      checked_at: new Date().toISOString(),
      error: err.message,
    };
  }
}

function getMetricsSnapshot() {
  const rates = computeRates(RATE_WINDOW_SEC);
  return {
    timestamp: new Date().toISOString(),
    process: getProcessMetrics(),
    requests: {
      per_minute_global: rates.per_minute_global,
      errors_per_minute: rates.errors_per_minute,
      timeouts_per_minute: rates.timeouts_per_minute,
      error_rate_global: rates.error_rate_global,
    },
    endpoints: rates.per_endpoint,
    latency: {
      avg_ms_by_endpoint: endpoints.reduce((acc, key) => {
        acc[key] = rates.per_endpoint[key].avg_latency_ms;
        return acc;
      }, {}),
      p95_ms_by_endpoint: endpoints.reduce((acc, key) => {
        acc[key] = rates.per_endpoint[key].p95_latency_ms;
        return acc;
      }, {}),
    },
    queues: getQueueStats(),
    db: lastDbStatus,
  };
}

function getRangeSeries({ from, to, bucketSeconds } = {}) {
  ensureInitialized();
  const start = Number(from) || Date.now() - DEFAULT_RETENTION_SEC * 1000;
  const end = Number(to) || Date.now();
  const bucketSize = Number(bucketSeconds) || bucketSec;
  const series = [];
  for (const bucket of ring) {
    if (!bucket) continue;
    if (bucket.ts < start || bucket.ts > end) continue;
    series.push({
      ts: bucket.ts,
      total: bucket.total,
      perEndpoint: bucket.perEndpoint,
    });
  }

  const grouped = new Map();
  for (const item of series) {
    const bucketTime = Math.floor(item.ts / (bucketSize * 1000)) * bucketSize * 1000;
    const entry = grouped.get(bucketTime) || {
      ts: bucketTime,
      total: createEndpointStats(),
      perEndpoint: endpoints.reduce((acc, key) => {
        acc[key] = createEndpointStats();
        return acc;
      }, {}),
    };
    entry.total.count += item.total.count;
    entry.total.errors += item.total.errors;
    entry.total.timeouts += item.total.timeouts;
    entry.total.latency_sum_ms += item.total.latency_sum_ms;
    entry.total.latency_samples.push(...item.total.latency_samples);
    endpoints.forEach(key => {
      entry.perEndpoint[key].count += item.perEndpoint[key].count;
      entry.perEndpoint[key].errors += item.perEndpoint[key].errors;
      entry.perEndpoint[key].timeouts += item.perEndpoint[key].timeouts;
      entry.perEndpoint[key].latency_sum_ms += item.perEndpoint[key].latency_sum_ms;
      entry.perEndpoint[key].latency_samples.push(...item.perEndpoint[key].latency_samples);
    });
    grouped.set(bucketTime, entry);
  }

  return Array.from(grouped.values()).sort((a, b) => a.ts - b.ts);
}

function resolveMetricValueFromSnapshot(metricKey, scope = {}, snapshot) {
  const endpoint = scope.endpoint && endpoints.includes(scope.endpoint) ? scope.endpoint : null;

  switch (metricKey) {
    case 'cpu_percent':
      return snapshot.process.cpu_percent;
    case 'memory_rss_bytes':
      return snapshot.process.memory_rss_bytes;
    case 'heap_used_bytes':
      return snapshot.process.heap_used_bytes;
    case 'heap_total_bytes':
      return snapshot.process.heap_total_bytes;
    case 'event_loop_delay_ms':
      return snapshot.process.event_loop_delay_ms;
    case 'uptime_sec':
      return snapshot.process.uptime_sec;
    case 'req_per_min':
      return endpoint ? snapshot.endpoints[endpoint]?.per_minute || 0 : snapshot.requests.per_minute_global;
    case 'errors_per_min':
      return endpoint ? snapshot.endpoints[endpoint]?.errors_per_min || 0 : snapshot.requests.errors_per_minute;
    case 'timeouts_per_min':
      return endpoint ? snapshot.endpoints[endpoint]?.timeouts_per_min || 0 : snapshot.requests.timeouts_per_minute;
    case 'error_rate':
      return endpoint ? snapshot.endpoints[endpoint]?.error_rate || 0 : snapshot.requests.error_rate_global;
    case 'latency_avg_ms':
      return endpoint ? snapshot.latency.avg_ms_by_endpoint[endpoint] || 0 : 0;
    case 'latency_p95_ms':
      return endpoint ? snapshot.latency.p95_ms_by_endpoint[endpoint] || 0 : 0;
    case 'queue_active':
      return endpoint ? snapshot.queues?.[endpoint]?.active || 0 : 0;
    case 'queue_queued':
      return endpoint ? snapshot.queues?.[endpoint]?.queued || 0 : 0;
    default:
      return null;
  }
}

function resolveMetricValue(metricKey, scope = {}) {
  const snapshot = getMetricsSnapshot();
  return resolveMetricValueFromSnapshot(metricKey, scope, snapshot);
}

function startMetrics({ bucketSeconds = DEFAULT_BUCKET_SEC, retentionSeconds = DEFAULT_RETENTION_SEC } = {}) {
  bucketSec = bucketSeconds;
  ringSize = Math.ceil(retentionSeconds / bucketSec);
  ensureInitialized();

  if (!eventLoopHistogram) {
    eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
    eventLoopHistogram.enable();
  }

  if (!metricsInterval) {
    metricsInterval = setInterval(bucketize, bucketSec * 1000);
  }

  if (!dbInterval) {
    checkDbStatus();
    dbInterval = setInterval(checkDbStatus, 30000);
  }

  if (!cpuInterval) {
    const cores = os.cpus().length || 1;
    let lastUsage = process.cpuUsage();
    let lastTime = process.hrtime.bigint();
    cpuInterval = setInterval(() => {
      const usage = process.cpuUsage(lastUsage);
      const now = process.hrtime.bigint();
      const elapsedUs = Number(now - lastTime) / 1000;
      const totalCpuUs = usage.user + usage.system;
      const percent = elapsedUs ? (totalCpuUs / elapsedUs) / cores * 100 : 0;
      lastCpu = {
        percent: Math.max(0, Math.min(100, percent)),
        timestamp: Date.now(),
      };
      lastUsage = process.cpuUsage();
      lastTime = now;
    }, 1000);
  }
}

function stopMetrics() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
  if (dbInterval) {
    clearInterval(dbInterval);
    dbInterval = null;
  }
  if (cpuInterval) {
    clearInterval(cpuInterval);
    cpuInterval = null;
  }
  if (eventLoopHistogram) {
    eventLoopHistogram.disable();
    eventLoopHistogram = null;
  }
}

module.exports = {
  endpoints,
  registerSemaphore,
  resolveEndpointKey,
  recordRequest,
  recordTimeout,
  startMetrics,
  stopMetrics,
  getMetricsSnapshot,
  getRangeSeries,
  resolveMetricValue,
  resolveMetricValueFromSnapshot,
};
