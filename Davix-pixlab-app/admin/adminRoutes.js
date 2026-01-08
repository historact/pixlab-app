const express = require('express');
const { csrfProtection } = require('../utils/csrf');
const { createAdminDebugMiddleware, stashLoginSessionHash, logAdminDebug } = require('../utils/csrfDebug');
const { authenticator } = require('otplib');
const {
  recordFailure,
  checkLockout,
  verifyPassword,
  getTotpSecret,
  verifyTotp,
  canShowDevTotp,
  markDevTotpShown,
  logLoginFailure,
  logLoginSuccess,
} = require('../utils/adminAuth');
const {
  getSettings,
  updateChannelSettings,
  updateAlertSettings,
  tailChannel,
  streamExport,
  deleteChannelLogs,
  logAudit,
  logInternal,
} = require('../utils/logger');
const { sendAlert, templateTokens } = require('../utils/alerts');
const { isProduction } = require('../utils/config');
const { setNoStore } = require('../utils/noCache');
const { withTimeout, TimeoutError } = require('../utils/withTimeout');

function buildBaseUrl(req) {
  return req.baseUrl || '';
}

function renderLayout({ baseUrl, csrfToken, content, title = 'PixLab Admin Desk' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="${csrfToken}" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #0f172a; color: #e2e8f0; }
    header { background: #111827; padding: 16px 24px; border-bottom: 1px solid #1f2937; }
    h1 { margin: 0; font-size: 20px; }
    main { padding: 24px; }
    .tabs { display: flex; gap: 12px; margin-bottom: 16px; }
    .tab { padding: 8px 14px; border-radius: 6px; background: #1f2937; cursor: pointer; }
    .tab.active { background: #2563eb; }
    .panel { display: none; }
    .panel.active { display: block; }
    .card { background: #111827; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #1f2937; }
    label { display: block; font-size: 12px; margin-bottom: 4px; color: #94a3b8; }
    input, select, textarea { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; }
    button { padding: 8px 12px; border: none; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
    button.secondary { background: #475569; }
    button.warn { background: #dc2626; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .log-viewer { background: #0b1220; border: 1px solid #1f2937; padding: 12px; border-radius: 8px; height: 220px; overflow: auto; font-family: monospace; font-size: 12px; }
    .badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; background: #1f2937; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .error-box { background: #1f2937; border: 1px solid #f87171; color: #fecaca; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; }
    .log-meta { font-size: 11px; color: #94a3b8; margin-top: 6px; }
  </style>
</head>
<body>
  <header>
    <div class="row" style="justify-content: space-between;">
      <h1>${title}</h1>
      <a href="${baseUrl}/logout" style="color:#93c5fd;text-decoration:none;">Logout</a>
    </div>
  </header>
  <main>
    ${content}
  </main>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.content : '';
      const baseUrl = ${JSON.stringify(baseUrl)};
      const channels = ['external', 'internal', 'runtime', 'audit'];

      function setActiveTab(id) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === id));
        document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === id));
      }

      function showError(box, message) {
        if (!box) return;
        box.textContent = message;
        box.style.display = 'block';
      }

      function clearError(box) {
        if (!box) return;
        box.style.display = 'none';
      }

      async function fetchJson(url, options = {}) {
        const headers = Object.assign({ accept: 'application/json' }, options.headers || {});
        if (options.method && options.method !== 'GET') headers['x-csrf-token'] = csrfToken;
        const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });
        if (!res.ok) {
          const text = await res.text();
          const err = new Error(text || res.statusText);
          err.status = res.status;
          throw err;
        }
        return res.json();
      }

      function formatLogItem(item) {
        if (typeof item === 'string') return item;
        return JSON.stringify(item);
      }

      async function refreshLogs(channel) {
        const errorBox = document.querySelector('[data-log-error="' + channel + '"]');
        const metaBox = document.querySelector('[data-log-meta="' + channel + '"]');
        try {
          const levelInput = document.querySelector('[data-filter-level="' + channel + '"]');
          const searchInput = document.querySelector('[data-filter-search="' + channel + '"]');
          const linesInput = document.querySelector('[data-filter-lines="' + channel + '"]');
          const sinceInput = document.querySelector('[data-filter-since="' + channel + '"]');
          const untilInput = document.querySelector('[data-filter-until="' + channel + '"]');
          const params = new URLSearchParams({
            level: levelInput ? levelInput.value : '',
            search: searchInput ? searchInput.value : '',
            lines: linesInput ? linesInput.value : '',
            since: sinceInput ? sinceInput.value : '',
            until: untilInput ? untilInput.value : '',
          });
          const data = await fetchJson(baseUrl + '/api/logs/' + channel + '?' + params.toString());
          const container = document.querySelector('[data-log-viewer="' + channel + '"]');
          if (container) {
            container.textContent = data.items.map(formatLogItem).join('\n');
          }
          if (metaBox) {
            metaBox.textContent = 'Last loaded: ' + new Date().toLocaleString() + ' · Items: ' + data.items.length;
          }
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          showError(errorBox, 'Unable to load ' + channel + ' logs' + status + ': ' + err.message);
        }
      }

      async function refreshSettings() {
        const errorBox = document.querySelector('[data-alert-error]');
        try {
          const settings = await fetchJson(baseUrl + '/api/settings');
          window.adminSettings = settings;
          channels.forEach(channel => {
            const cfg = settings.channels[channel];
            if (!cfg) return;
            const enabledToggle = document.querySelector('[data-toggle="' + channel + '"]');
            if (enabledToggle) enabledToggle.checked = Boolean(cfg.enabled);
            const levelSelect = document.querySelector('[data-level="' + channel + '"]');
            if (levelSelect) levelSelect.value = cfg.level;
            const maxBytesInput = document.querySelector('[data-maxbytes="' + channel + '"]');
            if (maxBytesInput) maxBytesInput.value = cfg.max_bytes;
            const retentionInput = document.querySelector('[data-retention="' + channel + '"]');
            if (retentionInput) retentionInput.value = cfg.retention_days;
          });
          const emailEnabled = document.querySelector('[data-alert-email-enabled]');
          if (emailEnabled) emailEnabled.checked = settings.alerts.email.enabled;
          const emailRecipients = document.querySelector('[data-alert-email-recipients]');
          if (emailRecipients) emailRecipients.value = settings.alerts.email.recipients.join(', ');
          const emailTemplate = document.querySelector('[data-alert-email-template]');
          if (emailTemplate) emailTemplate.value = settings.alerts.email.template;
          const telegramEnabled = document.querySelector('[data-alert-telegram-enabled]');
          if (telegramEnabled) telegramEnabled.checked = settings.alerts.telegram.enabled;
          const telegramTargets = document.querySelector('[data-alert-telegram-targets]');
          if (telegramTargets) telegramTargets.value = settings.alerts.telegram.targets.join(', ');
          const telegramTemplate = document.querySelector('[data-alert-telegram-template]');
          if (telegramTemplate) telegramTemplate.value = settings.alerts.telegram.template;
          const cooldownInput = document.querySelector('[data-alert-cooldown]');
          if (cooldownInput) cooldownInput.value = settings.alerts.cooldown_seconds;
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          showError(errorBox, 'Unable to load alert settings' + status + ': ' + err.message);
        }
      }

      async function saveChannel(channel) {
        const errorBox = document.querySelector('[data-log-error="' + channel + '"]');
        try {
          const payload = {
            enabled: document.querySelector('[data-toggle="' + channel + '"]')?.checked,
            level: document.querySelector('[data-level="' + channel + '"]')?.value,
            max_bytes: document.querySelector('[data-maxbytes="' + channel + '"]')?.value,
            retention_days: document.querySelector('[data-retention="' + channel + '"]')?.value,
          };
          await fetchJson(baseUrl + '/api/logs/' + channel + '/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          await refreshSettings();
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          showError(errorBox, 'Unable to save ' + channel + ' settings' + status + ': ' + err.message);
        }
      }

      async function clearChannel(channel) {
        const errorBox = document.querySelector('[data-log-error="' + channel + '"]');
        try {
          await fetchJson(baseUrl + '/api/logs/' + channel + '/clear', { method: 'POST' });
          await refreshLogs(channel);
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          showError(errorBox, 'Unable to clear ' + channel + ' logs' + status + ': ' + err.message);
        }
      }

      async function saveAlerts() {
        const errorBox = document.querySelector('[data-alert-error]');
        try {
          const payload = {
            email: {
              enabled: document.querySelector('[data-alert-email-enabled]')?.checked,
              recipients: document.querySelector('[data-alert-email-recipients]')?.value.split(',').map(v => v.trim()).filter(Boolean),
              template: document.querySelector('[data-alert-email-template]')?.value,
            },
            telegram: {
              enabled: document.querySelector('[data-alert-telegram-enabled]')?.checked,
              targets: document.querySelector('[data-alert-telegram-targets]')?.value.split(',').map(v => v.trim()).filter(Boolean),
              template: document.querySelector('[data-alert-telegram-template]')?.value,
            },
            cooldown_seconds: document.querySelector('[data-alert-cooldown]')?.value,
          };
          await fetchJson(baseUrl + '/api/alerts/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          await refreshSettings();
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          showError(errorBox, 'Unable to save alert settings' + status + ': ' + err.message);
        }
      }

      document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setActiveTab(tab.dataset.tab)));
      setActiveTab('debug');

      document.querySelectorAll('[data-refresh]').forEach(btn => {
        btn.addEventListener('click', () => refreshLogs(btn.dataset.refresh));
      });
      document.querySelectorAll('[data-save]').forEach(btn => {
        btn.addEventListener('click', () => saveChannel(btn.dataset.save));
      });
      document.querySelectorAll('[data-clear]').forEach(btn => {
        btn.addEventListener('click', () => clearChannel(btn.dataset.clear));
      });
      document.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => {
          window.location = baseUrl + '/api/logs/' + btn.dataset.export + '/export';
        });
      });
      document.querySelectorAll('[data-expand]').forEach(btn => {
        btn.addEventListener('click', () => {
          const viewer = document.querySelector('[data-log-viewer="' + btn.dataset.expand + '"]');
          if (!viewer) return;
          viewer.style.height = viewer.style.height === '420px' ? '220px' : '420px';
        });
      });

      const alertSave = document.querySelector('[data-alert-save]');
      if (alertSave) alertSave.addEventListener('click', saveAlerts);
      const alertTest = document.querySelector('[data-alert-test]');
      if (alertTest) {
        alertTest.addEventListener('click', async () => {
          const errorBox = document.querySelector('[data-alert-error]');
          try {
            await fetchJson(baseUrl + '/api/alerts/test', { method: 'POST' });
            clearError(errorBox);
            alert('Test sent.');
          } catch (err) {
            const status = err?.status ? ' (status ' + err.status + ')' : '';
            showError(errorBox, 'Unable to send test alert' + status + ': ' + err.message);
          }
        });
      }

      refreshSettings()
        .then(() => {
          channels.forEach(refreshLogs);
        })
        .catch(() => {
          // errors already surfaced in UI
        });
      setInterval(() => {
        channels.forEach(refreshLogs);
      }, 10000);
    });
  </script>
</body>
</html>`;
}

function renderLogin({ baseUrl, csrfToken, error }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="${csrfToken}" />
  <title>PixLab Admin Login</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { background: #111827; padding: 24px; border-radius: 10px; width: 360px; border: 1px solid #1f2937; }
    label { display: block; font-size: 12px; margin-bottom: 4px; color: #94a3b8; }
    input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; margin-bottom: 12px; }
    button { width: 100%; padding: 10px; border: none; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
    .error { color: #f87171; margin-bottom: 12px; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="${baseUrl}/login">
    <input type="hidden" name="_csrf" value="${csrfToken}" />
    <h2>Admin Login</h2>
    ${error ? `<div class="error">${error}</div>` : ''}
    <label>Password</label>
    <input name="password" type="password" autocomplete="current-password" required />
    <label>TOTP Code</label>
    <input name="totp" type="text" autocomplete="one-time-code" required />
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

function renderBootstrap({ baseUrl, csrfToken, secret, otpauth }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin TOTP Bootstrap</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { background: #111827; padding: 24px; border-radius: 10px; width: 480px; border: 1px solid #1f2937; }
    code { display: block; padding: 12px; background: #0b1220; border-radius: 8px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Admin TOTP Bootstrap (dev only)</h2>
    <p>Scan this secret in your authenticator app. This page is shown only once.</p>
    <code>${secret}</code>
    <p>OTPAuth URI:</p>
    <code>${otpauth}</code>
    <form method="POST" action="${baseUrl}/bootstrap/ack">
      <input type="hidden" name="_csrf" value="${csrfToken}" />
      <button type="submit">I have saved this secret</button>
    </form>
  </div>
</body>
</html>`;
}

function renderAdminPage({ baseUrl, csrfToken, settings }) {
  const channelSections = ['external', 'internal', 'runtime', 'audit']
    .map(channel => {
      const cfg = settings.channels[channel];
      const isAudit = channel === 'audit';
      return `
      <div class="card">
        <div class="row" style="justify-content: space-between;">
          <h3>${channel.toUpperCase()} <span class="badge">${cfg.enabled ? 'enabled' : 'disabled'}</span></h3>
          <div class="row">
            ${!isAudit ? `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" data-toggle="${channel}" /> Enabled</label>` : ''}
            <button class="secondary" data-refresh="${channel}">Refresh</button>
            <button class="secondary" data-expand="${channel}">Expand</button>
            <button class="secondary" data-export="${channel}">Export</button>
            <button class="warn" data-clear="${channel}">Clear</button>
          </div>
        </div>
        <div class="grid">
          <div>
            <label>Level threshold</label>
            <select data-level="${channel}">
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </div>
          <div>
            <label>Max bytes</label>
            <input type="number" data-maxbytes="${channel}" />
          </div>
          <div>
            <label>Retention days</label>
            <input type="number" data-retention="${channel}" />
          </div>
          <div>
            <label>&nbsp;</label>
            ${!isAudit ? `<button data-save="${channel}">Save</button>` : '<button class="secondary" disabled>Env controlled</button>'}
          </div>
        </div>
        <div class="grid" style="margin-top:12px;">
          <div>
            <label>Lines</label>
            <input data-filter-lines="${channel}" value="200" />
          </div>
          <div>
            <label>Level filter</label>
            <select data-filter-level="${channel}">
              <option value="">All</option>
              <option value="debug">debug+</option>
              <option value="info">info+</option>
              <option value="warn">warn+</option>
              <option value="error">error</option>
            </select>
          </div>
          <div>
            <label>Search</label>
            <input data-filter-search="${channel}" placeholder="text" />
          </div>
          <div>
            <label>Since (ISO)</label>
            <input data-filter-since="${channel}" placeholder="2026-01-01T00:00:00Z" />
          </div>
          <div>
            <label>Until (ISO)</label>
            <input data-filter-until="${channel}" placeholder="2026-01-01T23:59:59Z" />
          </div>
        </div>
        <div class="log-viewer" data-log-viewer="${channel}"></div>
        <div class="log-meta" data-log-meta="${channel}">Last loaded: never</div>
        <div class="error-box" data-log-error="${channel}" style="display:none;"></div>
      </div>`;
    })
    .join('');

  const content = `
    <div class="tabs">
      <div class="tab active" data-tab="debug">Debug Logs</div>
      <div class="tab" data-tab="alerts">Alerting</div>
    </div>
    <section class="panel active" id="debug">
      ${channelSections}
    </section>
    <section class="panel" id="alerts">
      <div class="error-box" data-alert-error style="display:none;"></div>
      <div class="card">
        <h3>Email Alerts</h3>
        <div class="grid">
          <div>
            <label>Enabled</label>
            <input type="checkbox" data-alert-email-enabled />
          </div>
          <div>
            <label>Recipients (comma separated)</label>
            <input data-alert-email-recipients />
          </div>
        </div>
        <label>Template</label>
        <textarea rows="4" data-alert-email-template></textarea>
      </div>
      <div class="card">
        <h3>Telegram Alerts</h3>
        <div class="grid">
          <div>
            <label>Enabled</label>
            <input type="checkbox" data-alert-telegram-enabled />
          </div>
          <div>
            <label>Targets (comma separated)</label>
            <input data-alert-telegram-targets />
          </div>
        </div>
        <label>Template</label>
        <textarea rows="4" data-alert-telegram-template></textarea>
      </div>
      <div class="card">
        <h3>Alert Controls</h3>
        <div class="grid">
          <div>
            <label>Cooldown seconds</label>
            <input data-alert-cooldown />
          </div>
          <div>
            <label>Actions</label>
            <div class="row">
              <button data-alert-save>Save Alert Settings</button>
              <button class="secondary" data-alert-test>Send Test</button>
            </div>
          </div>
        </div>
        <p>Available tokens: ${Object.keys(templateTokens({})).map(t => `{${t}}`).join(', ')}</p>
      </div>
    </section>
  `;

  return renderLayout({ baseUrl, csrfToken, content });
}

function requireAuth(req, res, next) {
  if (req.session?.adminAuthenticated) return next();
  return res.redirect(`${buildBaseUrl(req)}/login`);
}

function disableAdminHtmlCaching(res) {
  setNoStore(res);
  res.removeHeader('ETag');
  res.removeHeader('Last-Modified');
  res.setHeader('ETag', '');
}

function logLoginStep(req, startTime, step, payload = {}) {
  if (process.env.DAVIX_DEBUG_INTERNAL !== '1') return;
  logInternal('admin.login.step', {
    request_id: req.requestId,
    step,
    elapsed_ms: Date.now() - startTime,
    ...payload,
  });
}

async function runNonCritical(promise, label, req) {
  const guarded = Promise.resolve(promise).catch(err => {
    logInternal('admin.login.noncritical_error', {
      request_id: req.requestId,
      label,
      message: err?.message,
      code: err?.code,
    });
    return null;
  });
  try {
    return await withTimeout(guarded, 2000, label);
  } catch (err) {
    if (err instanceof TimeoutError) {
      logInternal('admin.login.db_timeout', { request_id: req.requestId, label });
      return null;
    }
    return null;
  }
}

function mountAdmin(app) {
  const router = express.Router();
  router.use(createAdminDebugMiddleware());
  router.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      if (process.env.DAVIX_DEBUG_INTERNAL === '1' || durationMs > 2000) {
        logInternal('admin.request.done', {
          request_id: req.requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          duration_ms: durationMs,
        });
      }
    });
    next();
  });
  router.use((req, res, next) => {
    if (req.method === 'GET' && ['/login', '/bootstrap', '/'].includes(req.path)) {
      disableAdminHtmlCaching(res);
    }
    return next();
  });
  router.use((req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/login') return next();
    let bodySent;
    const originalSend = res.send.bind(res);
    res.send = body => {
      bodySent = body;
      return originalSend(body);
    };
    res.on('finish', () => {
      const location = res.getHeader('location');
      const bodyText = typeof bodySent === 'string'
        ? bodySent
        : Buffer.isBuffer(bodySent)
          ? bodySent.toString('utf8')
          : null;
      logAdminDebug(req, {
        stage: 'login_response',
        status: res.statusCode,
        location,
        invalid_csrf_body: bodyText === 'Invalid CSRF token',
      });
    });
    next();
  });
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());
  router.use(csrfProtection({ getSecret: req => req.app?.get?.('adminSessionSecret') }));

  router.get('/login', async (req, res) => {
    stashLoginSessionHash(req);
    disableAdminHtmlCaching(res);
    res.send(renderLogin({ baseUrl: buildBaseUrl(req), csrfToken: req.csrfToken(), error: null }));
  });

  router.post('/login', async (req, res) => {
    const startTime = Date.now();
    logLoginStep(req, startTime, 'start');
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
      const { allowed, retryAfterMs } = checkLockout(ip, 'admin');
      logLoginStep(req, startTime, 'after_lockout_check', { allowed });
      if (!allowed) {
        logLoginStep(req, startTime, 'before_log_failure', { reason: 'locked' });
        logLoginFailure({ ip, reason: 'locked', retry_after_ms: retryAfterMs });
        logLoginStep(req, startTime, 'after_log_failure', { reason: 'locked' });
        logLoginStep(req, startTime, 'before_alert_send', { alert: 'admin.login.locked' });
        await runNonCritical(sendAlert({
          channel: 'audit',
          level: 'warn',
          event: 'admin.login.locked',
          message: 'Admin login blocked due to lockout.',
          ip,
        }), 'alert_locked', req);
        logLoginStep(req, startTime, 'after_alert_send', { alert: 'admin.login.locked' });
        disableAdminHtmlCaching(res);
        return res.status(429).send(renderLogin({
          baseUrl: buildBaseUrl(req),
          csrfToken: req.csrfToken(),
          error: 'Too many attempts. Try again later.',
        }));
      }

      const { password, totp } = req.body || {};
      logLoginStep(req, startTime, 'parsed_body', {
        fields: Object.keys(req.body || {}),
        has_password: Boolean(password),
        has_totp: Boolean(totp),
      });
      logLoginStep(req, startTime, 'before_password_verify');
      let passwordOk;
      try {
        passwordOk = await withTimeout(verifyPassword(password || ''), 3000, 'password_verify');
      } catch (err) {
        if (err instanceof TimeoutError) {
          logLoginStep(req, startTime, 'password_verify_timeout');
          disableAdminHtmlCaching(res);
          return res.status(503).send(renderLogin({
            baseUrl: buildBaseUrl(req),
            csrfToken: req.csrfToken(),
            error: 'Login temporarily unavailable. Please try again.',
          }));
        }
        throw err;
      }
      logLoginStep(req, startTime, 'after_password_verify', { password_ok: passwordOk });
      logLoginStep(req, startTime, 'before_totp_secret');
      const { secret } = await getTotpSecret();
      logLoginStep(req, startTime, 'after_totp_secret', { secret_present: Boolean(secret) });
      logLoginStep(req, startTime, 'before_totp_verify');
      const totpOk = verifyTotp(String(totp || ''), secret || '');
      logLoginStep(req, startTime, 'after_totp_verify', { totp_ok: totpOk });

      if (!passwordOk || !totpOk) {
        logLoginStep(req, startTime, 'before_record_failure');
        const attempt = recordFailure(ip, 'admin');
        logLoginStep(req, startTime, 'after_record_failure', { attempts: attempt.count });
        logLoginStep(req, startTime, 'before_log_failure', { reason: 'invalid_credentials' });
        logLoginFailure({ ip, reason: 'invalid_credentials', attempts: attempt.count });
        logLoginStep(req, startTime, 'after_log_failure', { reason: 'invalid_credentials' });
        logLoginStep(req, startTime, 'before_alert_send', { alert: 'admin.login.failed' });
        await runNonCritical(sendAlert({
          channel: 'audit',
          level: 'warn',
          event: 'admin.login.failed',
          message: 'Admin login failed.',
          ip,
        }), 'alert_failed', req);
        logLoginStep(req, startTime, 'after_alert_send', { alert: 'admin.login.failed' });
        disableAdminHtmlCaching(res);
        return res.status(401).send(renderLogin({
          baseUrl: buildBaseUrl(req),
          csrfToken: req.csrfToken(),
          error: 'Invalid credentials or TOTP code.',
        }));
      }

      req.session.adminAuthenticated = true;
      logLoginStep(req, startTime, 'before_log_success');
      logLoginSuccess({ ip, method: req.method, path: req.path });
      logLoginStep(req, startTime, 'after_log_success');
      logLoginStep(req, startTime, 'before_session_save');
      if (req.session?.save) {
        await new Promise((resolve, reject) => {
          req.session.save(err => (err ? reject(err) : resolve()));
        });
      }
      logLoginStep(req, startTime, 'after_session_save');
      logLoginStep(req, startTime, 'before_redirect');
      return res.redirect(`${buildBaseUrl(req)}/`);
    } catch (err) {
      logLoginStep(req, startTime, 'error', { name: err?.name, message: err?.message });
      disableAdminHtmlCaching(res);
      return res.status(500).send(renderLogin({
        baseUrl: buildBaseUrl(req),
        csrfToken: req.csrfToken(),
        error: 'Login failed due to a server error. Please try again.',
      }));
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect(`${buildBaseUrl(req)}/login`);
    });
  });

  router.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect(`${buildBaseUrl(req)}/login`);
    });
  });

  router.get('/bootstrap', async (req, res) => {
    if (isProduction() || !canShowDevTotp()) {
      return res.status(404).send('Not found');
    }
    const { secret } = await getTotpSecret();
    const otpauth = authenticator.keyuri('pixlab-admin', 'pixlab', secret);
    disableAdminHtmlCaching(res);
    res.send(renderBootstrap({ baseUrl: buildBaseUrl(req), csrfToken: req.csrfToken(), secret, otpauth }));
  });

  router.post('/bootstrap/ack', (req, res) => {
    if (isProduction() || !canShowDevTotp()) {
      return res.status(404).send('Not found');
    }
    markDevTotpShown();
    res.redirect(`${buildBaseUrl(req)}/login`);
  });

  router.get('/', requireAuth, (req, res) => {
    const settings = getSettings();
    disableAdminHtmlCaching(res);
    res.send(renderAdminPage({ baseUrl: buildBaseUrl(req), csrfToken: req.csrfToken(), settings }));
  });

  router.get('/api/settings', requireAuth, (req, res) => {
    res.json(getSettings());
  });

  router.get('/api/logs/:channel', requireAuth, async (req, res) => {
    const { channel } = req.params;
    const items = await tailChannel(channel, req.query);
    res.json({ items });
  });

  router.post('/api/logs/:channel/settings', requireAuth, (req, res) => {
    const { channel } = req.params;
    const settings = updateChannelSettings(channel, req.body || {});
    logAudit('admin.log.settings.updated', { channel, actor: 'admin' });
    res.json(settings);
  });

  router.post('/api/logs/:channel/clear', requireAuth, (req, res) => {
    const { channel } = req.params;
    deleteChannelLogs(channel);
    logAudit('admin.log.cleared', { channel, actor: 'admin' });
    res.json({ ok: true });
  });

  router.get('/api/logs/:channel/export', requireAuth, (req, res) => {
    const { channel } = req.params;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${channel}-logs.jsonl`);
    logAudit('admin.log.exported', { channel, actor: 'admin' });
    streamExport(channel, res);
  });

  router.post('/api/alerts/settings', requireAuth, (req, res) => {
    const settings = updateAlertSettings(req.body || {});
    logAudit('admin.alerts.updated', { actor: 'admin' });
    res.json(settings);
  });

  router.post('/api/alerts/test', requireAuth, async (req, res) => {
    const payload = {
      channel: 'audit',
      level: 'info',
      event: 'admin.alert.test',
      message: 'Test alert from PixLab admin',
    };
    await sendAlert(payload, { force: true });
    logAudit('admin.alerts.test', { actor: 'admin' });
    res.json({ ok: true });
  });

  router.use((err, req, res, next) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || 'Internal Server Error';
    res.setHeader('X-PixLab-Error-Source', 'admin-router');
    logInternal('admin.error', {
      request_id: req.requestId,
      status,
      message,
      stack: process.env.DAVIX_DEBUG_INTERNAL === '1' ? err?.stack : undefined,
    });
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).send(message);
  });

  app.use(router);
}

module.exports = { mountAdmin };
