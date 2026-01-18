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
  getSubscriptionEventSettings,
  updateChannelSettings,
  updateSubscriptionEventSettings,
  updateAlertSettings,
  tailChannel,
  streamExport,
  deleteChannelLogs,
  logAudit,
  logInternal,
} = require('../utils/logger');
const {
  querySubscriptionEvents,
  streamSubscriptionEventsCsv,
} = require('../utils/subscriptionEvents');
const { sendAlert, templateTokens } = require('../utils/alerts');
const { isProduction } = require('../utils/config');
const { setNoStore } = require('../utils/noCache');
const { withTimeout, TimeoutError } = require('../utils/withTimeout');
const { extractClientInfo } = require('../utils/requestInfo');
const { attachRequestId } = require('../utils/responseMeta');
const { getMetricsSnapshot, getRangeSeries } = require('../utils/metrics');
const {
  listRules,
  upsertRule,
  deleteRule,
  listActiveAlerts,
  listResolvedAlerts,
  ackAlert,
  silenceAlert,
} = require('../utils/alertEngine');

function buildBaseUrl(req) {
  return req.baseUrl || '';
}

function sendJson(req, res, payload) {
  return res.json(attachRequestId(req, payload));
}

function toMysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function buildAdminScript(baseUrl) {
  return `
    window.addEventListener('DOMContentLoaded', () => {
      const jsStatus = document.getElementById('js-status');
      if (jsStatus) jsStatus.remove();
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.content : '';
      const channels = ['external', 'internal', 'runtime', 'audit'];

      const toast = document.getElementById('globalToast');
      let toastTimer = null;

      function showToast(message, type = 'success') {
        if (!toast) return;
        toast.classList.remove('toast--success', 'toast--error');
        toast.classList.add(type === 'error' ? 'toast--error' : 'toast--success');
        toast.textContent = message;
        toast.style.display = 'block';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.style.display = 'none';
          toast.textContent = '';
        }, 3500);
      }

      function updateChannelBadge(channel, enabled) {
        const badge = document.querySelector('[data-channel-badge="' + channel + '"]');
        if (!badge) return;
        badge.textContent = enabled ? 'enabled' : 'disabled';
        badge.classList.toggle('badge--enabled', enabled);
        badge.classList.toggle('badge--disabled', !enabled);
      }

      function updateSubscriptionEventsBadge(enabled) {
        const badge = document.querySelector('[data-subscription-events-badge]');
        if (!badge) return;
        badge.textContent = enabled ? 'enabled' : 'disabled';
        badge.classList.toggle('badge--enabled', enabled);
        badge.classList.toggle('badge--disabled', !enabled);
      }

      const tabKeys = ['monitoring', 'debug', 'alerts'];
      const tabStorageKey = 'pixlab_admin_tab';

      function setActiveTab(id, persist = true) {
        const normalized = tabKeys.includes(id) ? id : 'monitoring';
        document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === normalized));
        document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === normalized));
        if (!persist) return;
        try {
          window.localStorage.setItem(tabStorageKey, normalized);
        } catch {}
        const newHash = '#' + normalized;
        if (window.location.hash !== newHash) {
          window.history.replaceState(null, '', newHash);
        }
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

      const statusTimers = new WeakMap();

      function showStatus(box, message) {
        if (!box) return;
        const existingTimer = statusTimers.get(box);
        if (existingTimer) clearTimeout(existingTimer);
        box.textContent = message;
        box.style.display = 'block';
        showToast(message, 'success');
        const timer = setTimeout(() => {
          box.style.display = 'none';
          box.textContent = '';
        }, 4000);
        statusTimers.set(box, timer);
      }

      function formatTime() {
        return new Date().toLocaleTimeString();
      }

      function formatMb(bytes) {
        const mb = Number(bytes) / (1024 * 1024);
        if (!Number.isFinite(mb)) return '';
        if (Number.isInteger(mb)) return String(mb);
        return mb.toFixed(2);
      }

      function formatChartRate(value) {
        if (!Number.isFinite(value)) return '--';
        if (Number.isInteger(value)) return String(value);
        return value.toFixed(1);
      }

      function formatLatencyValue(value) {
        if (!Number.isFinite(value)) return '--';
        return Math.round(value) + ' ms';
      }

      function toIsoString(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString();
      }

      function escapeHtml(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;
        if (!button.dataset.label) {
          button.dataset.label = button.textContent;
        }
        if (isLoading) {
          const text = loadingText || button.dataset.label;
          button.disabled = true;
          button.setAttribute('aria-busy', 'true');
          button.innerHTML = '<span class="btn-content"><span class="spinner" aria-hidden="true"></span><span class="btn-label">' + text + '</span></span>';
        } else {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = button.dataset.label || '';
        }
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

      async function refreshLogs(channel, options = {}) {
        const errorBox = document.querySelector('[data-log-error="' + channel + '"]');
        const metaBox = document.querySelector('[data-log-meta="' + channel + '"]');
        const statusBox = document.querySelector('[data-log-status="' + channel + '"]');
        const showSuccess = options.showStatus === true;
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
            since: sinceInput ? toIsoString(sinceInput.value) : '',
            until: untilInput ? toIsoString(untilInput.value) : '',
          });
          const data = await fetchJson(baseUrl + '/api/logs/' + channel + '?' + params.toString());
          const container = document.querySelector('[data-log-viewer="' + channel + '"]');
          if (container) {
            container.textContent = data.items.map(formatLogItem).join('\\n');
          }
          if (metaBox) {
            metaBox.textContent = 'Last loaded: ' + new Date().toLocaleString() + ' · Items: ' + data.items.length;
          }
          if (showSuccess) {
            showStatus(statusBox, 'Refreshed ✓ · ' + formatTime());
          }
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to load ' + channel + ' logs' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      function updateRuleChannelVisibility(alertSettings = {}) {
        const emailEnabled = Boolean(alertSettings.email?.enabled);
        const telegramEnabled = Boolean(alertSettings.telegram?.enabled);
        const emailRow = document.querySelector('[data-rule-channel="email"]');
        const telegramRow = document.querySelector('[data-rule-channel="telegram"]');
        const emptyRow = document.querySelector('[data-rule-channel-empty]');
        if (emailRow) {
          emailRow.style.display = emailEnabled ? '' : 'none';
          if (!emailEnabled) {
            const emailToggle = document.querySelector('[data-rule-channel-email]');
            if (emailToggle) emailToggle.checked = false;
          }
        }
        if (telegramRow) {
          telegramRow.style.display = telegramEnabled ? '' : 'none';
          if (!telegramEnabled) {
            const telegramToggle = document.querySelector('[data-rule-channel-telegram]');
            if (telegramToggle) telegramToggle.checked = false;
          }
        }
        if (emptyRow) {
          emptyRow.style.display = emailEnabled || telegramEnabled ? 'none' : 'block';
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
            if (maxBytesInput) maxBytesInput.value = formatMb(cfg.max_bytes);
            const retentionInput = document.querySelector('[data-retention="' + channel + '"]');
            if (retentionInput) retentionInput.value = cfg.retention_days;
            updateChannelBadge(channel, Boolean(cfg.enabled));
          });
          const emailEnabled = document.querySelector('[data-alert-email-enabled]');
          if (emailEnabled) emailEnabled.checked = settings.alerts.email.enabled;
          const emailRecipients = document.querySelector('[data-alert-email-recipients]');
          if (emailRecipients) emailRecipients.value = settings.alerts.email.recipients.join(', ');
          const emailSubject = document.querySelector('[data-alert-email-subject]');
          if (emailSubject) emailSubject.value = settings.alerts.email.subject_template || '';
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
          updateRuleChannelVisibility(settings.alerts);
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to load alert settings' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      async function refreshSubscriptionEventSettings() {
        const errorBox = document.querySelector('[data-subscription-events-error]');
        try {
          const settings = await fetchJson(baseUrl + '/api/subscription-events/settings');
          const enabledToggle = document.querySelector('[data-subscription-events-enabled]');
          const retentionInput = document.querySelector('[data-subscription-events-retention]');
          if (enabledToggle) enabledToggle.checked = Boolean(settings.enabled);
          if (retentionInput) retentionInput.value = settings.retentionDays;
          updateSubscriptionEventsBadge(Boolean(settings.enabled));
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to load subscription events settings' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      async function saveSubscriptionEventSettings() {
        const errorBox = document.querySelector('[data-subscription-events-error]');
        const statusBox = document.querySelector('[data-subscription-events-status]');
        try {
          const payload = {
            enabled: document.querySelector('[data-subscription-events-enabled]')?.checked,
            retentionDays: document.querySelector('[data-subscription-events-retention]')?.value,
          };
          await fetchJson(baseUrl + '/api/subscription-events/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          await refreshSubscriptionEventSettings();
          showStatus(statusBox, 'Saved ✓ · ' + formatTime());
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to save subscription events settings' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      // Subscription Events UI updates:
      // + Escaped table rendering + responsive/modal tables
      // + Status badge + clear filters + expand modal actions
      // + Cache last fetch for modal reuse
      const lastSubscriptionEventsData = {
        rows: [],
        params: '',
        fetchedAt: 0,
      };

      function buildSubscriptionEventRows(rows = []) {
        if (!rows.length) {
          return '<tr><td colspan="9">No results</td></tr>';
        }
        return rows
          .map(row =>
            '<tr>'
              + '<td>' + escapeHtml(row.received_at || '') + '</td>'
              + '<td>' + escapeHtml(row.event_id || '') + '</td>'
              + '<td>' + escapeHtml(row.event_type || row.normalized_event || '') + '</td>'
              + '<td>' + escapeHtml(row.subscription_id || '') + '</td>'
              + '<td>' + escapeHtml(row.customer_email || '') + '</td>'
              + '<td>' + escapeHtml(row.plan_slug || '') + '</td>'
              + '<td>' + escapeHtml(row.decision || '') + '</td>'
              + '<td>' + escapeHtml(row.api_key_id || '') + '</td>'
              + '<td>' + escapeHtml(row.error_message || '') + '</td>'
            + '</tr>'
          )
          .join('');
      }

      function renderSubscriptionEventsTable(rows = []) {
        const tableBody = document.querySelector('[data-subscription-events-table-body]');
        if (!tableBody) return;
        tableBody.innerHTML = buildSubscriptionEventRows(rows);
      }

      function syncSubscriptionEventsModal() {
        const modalBody = document.querySelector('[data-subscription-events-modal-body]');
        if (!modalBody || !window.__subscriptionEventsModalOpen) return;
        modalBody.innerHTML = buildSubscriptionEventRows(lastSubscriptionEventsData.rows || []);
      }

      async function refreshSubscriptionEvents({ showStatus: showSuccess } = {}) {
        const errorBox = document.querySelector('[data-subscription-events-error]');
        const statusBox = document.querySelector('[data-subscription-events-status]');
        const metaBox = document.querySelector('[data-subscription-events-meta]');
        try {
          const params = new URLSearchParams({
            event_id: document.querySelector('[data-subscription-events-filter="event_id"]')?.value || '',
            wp_user_id: document.querySelector('[data-subscription-events-filter="wp_user_id"]')?.value || '',
            customer_email: document.querySelector('[data-subscription-events-filter="customer_email"]')?.value || '',
            subscription_id: document.querySelector('[data-subscription-events-filter="subscription_id"]')?.value || '',
            order_id: document.querySelector('[data-subscription-events-filter="order_id"]')?.value || '',
            event_type: document.querySelector('[data-subscription-events-filter="event_type"]')?.value || '',
            plan_slug: document.querySelector('[data-subscription-events-filter="plan_slug"]')?.value || '',
            decision: document.querySelector('[data-subscription-events-filter="decision"]')?.value || '',
            received_from: toIsoString(document.querySelector('[data-subscription-events-filter="received_from"]')?.value),
            received_until: toIsoString(document.querySelector('[data-subscription-events-filter="received_until"]')?.value),
            limit: document.querySelector('[data-subscription-events-filter="limit"]')?.value || '',
            offset: document.querySelector('[data-subscription-events-filter="offset"]')?.value || '',
          });
          const data = await fetchJson(baseUrl + '/api/subscription-events?' + params.toString());
          renderSubscriptionEventsTable(data.rows || []);
          lastSubscriptionEventsData.rows = data.rows || [];
          lastSubscriptionEventsData.params = params.toString();
          lastSubscriptionEventsData.fetchedAt = Date.now();
          if (metaBox) {
            metaBox.textContent = 'Total: ' + data.total + ' · Showing: ' + (data.rows || []).length;
          }
          if (showSuccess) {
            showStatus(statusBox, 'Refreshed ✓ · ' + formatTime());
          }
          syncSubscriptionEventsModal();
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to load subscription events' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      function clearSubscriptionEventsFilters() {
        const defaults = {
          event_id: '',
          wp_user_id: '',
          customer_email: '',
          subscription_id: '',
          order_id: '',
          event_type: '',
          plan_slug: '',
          decision: '',
          received_from: '',
          received_until: '',
          limit: '50',
          offset: '0',
        };
        Object.keys(defaults).forEach(key => {
          const input = document.querySelector('[data-subscription-events-filter="' + key + '"]');
          if (input) input.value = defaults[key];
        });
      }

      function exportSubscriptionEvents(all = false) {
        const params = new URLSearchParams({
          event_id: document.querySelector('[data-subscription-events-filter="event_id"]')?.value || '',
          wp_user_id: document.querySelector('[data-subscription-events-filter="wp_user_id"]')?.value || '',
          customer_email: document.querySelector('[data-subscription-events-filter="customer_email"]')?.value || '',
          subscription_id: document.querySelector('[data-subscription-events-filter="subscription_id"]')?.value || '',
          order_id: document.querySelector('[data-subscription-events-filter="order_id"]')?.value || '',
          event_type: document.querySelector('[data-subscription-events-filter="event_type"]')?.value || '',
          plan_slug: document.querySelector('[data-subscription-events-filter="plan_slug"]')?.value || '',
          decision: document.querySelector('[data-subscription-events-filter="decision"]')?.value || '',
          received_from: toIsoString(document.querySelector('[data-subscription-events-filter="received_from"]')?.value),
          received_until: toIsoString(document.querySelector('[data-subscription-events-filter="received_until"]')?.value),
        });
        const suffix = all ? '' : '?' + params.toString();
        window.location = baseUrl + '/api/subscription-events/export' + (all ? '' : suffix);
      }

      function closeSubscriptionEventsModal() {
        const backdrop = document.getElementById('subscriptionEventsModalBackdrop');
        if (!backdrop) return;
        backdrop.style.display = 'none';
        document.body.style.overflow = '';
        window.__subscriptionEventsModalOpen = false;
      }

      function openSubscriptionEventsModal() {
        const backdrop = document.getElementById('subscriptionEventsModalBackdrop');
        const actions = document.getElementById('subscriptionEventsModalActions');
        if (!backdrop || !actions) return;
        actions.innerHTML = '';

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = 'Refresh';
        refreshBtn.className = 'secondary';
        refreshBtn.addEventListener('click', async () => {
          setButtonLoading(refreshBtn, true, 'Refreshing');
          try {
            await refreshSubscriptionEvents({ showStatus: true });
          } finally {
            setButtonLoading(refreshBtn, false);
          }
        });
        actions.appendChild(refreshBtn);

        const exportFilteredBtn = document.createElement('button');
        exportFilteredBtn.textContent = 'Export Filtered';
        exportFilteredBtn.className = 'secondary';
        exportFilteredBtn.addEventListener('click', () => exportSubscriptionEvents(false));
        actions.appendChild(exportFilteredBtn);

        const exportAllBtn = document.createElement('button');
        exportAllBtn.textContent = 'Export All';
        exportAllBtn.className = 'secondary';
        exportAllBtn.addEventListener('click', () => exportSubscriptionEvents(true));
        actions.appendChild(exportAllBtn);

        window.__subscriptionEventsModalOpen = true;
        backdrop.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        syncSubscriptionEventsModal();
        showToast('Opened Subscription Events modal', 'success');
      }

      async function saveChannel(channel) {
        const errorBox = document.querySelector('[data-log-error="' + channel + '"]');
        const statusBox = document.querySelector('[data-log-status="' + channel + '"]');
        try {
          const maxMbValue = parseFloat(document.querySelector('[data-maxbytes="' + channel + '"]')?.value);
          const maxBytes = Number.isFinite(maxMbValue) ? Math.round(maxMbValue * 1024 * 1024) : '';
          const payload = {
            enabled: document.querySelector('[data-toggle="' + channel + '"]')?.checked,
            level: document.querySelector('[data-level="' + channel + '"]')?.value,
            max_bytes: maxBytes,
            retention_days: document.querySelector('[data-retention="' + channel + '"]')?.value,
          };
          await fetchJson(baseUrl + '/api/logs/' + channel + '/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          await refreshSettings();
          showStatus(statusBox, 'Saved ✓ · ' + formatTime());
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to save ' + channel + ' settings' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      async function clearChannel(channel) {
        const errorBox = document.querySelector('[data-log-error="' + channel + '"]');
        const statusBox = document.querySelector('[data-log-status="' + channel + '"]');
        try {
          await fetchJson(baseUrl + '/api/logs/' + channel + '/clear', { method: 'POST' });
          await refreshLogs(channel);
          showStatus(statusBox, 'Cleared ✓ · ' + formatTime());
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to clear ' + channel + ' logs' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      async function saveAlerts() {
        const errorBox = document.querySelector('[data-alert-error]');
        const statusBox = document.querySelector('[data-alert-status]');
        try {
          const payload = {
            email: {
              enabled: document.querySelector('[data-alert-email-enabled]')?.checked,
              recipients: document.querySelector('[data-alert-email-recipients]')?.value.split(',').map(v => v.trim()).filter(Boolean),
              subject_template: document.querySelector('[data-alert-email-subject]')?.value,
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
          showStatus(statusBox, 'Alert settings saved ✓ · ' + formatTime());
          clearError(errorBox);
        } catch (err) {
          const status = err?.status ? ' (status ' + err.status + ')' : '';
          const message = 'Unable to save alert settings' + status + ': ' + err.message;
          showError(errorBox, message);
          showToast(message, 'error');
        }
      }

      function buildSparkline(points) {
        if (!points.length) return '';
        const values = points.map(point => point[1]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const width = 320;
        const height = 80;
        const step = width / Math.max(points.length - 1, 1);
        const path = values
          .map((value, idx) => {
            const x = idx * step;
            const y = height - ((value - min) / range) * height;
            return (idx === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
          })
          .join(' ');
        return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +
          '<path d="' + path + '" fill="none" stroke="#f472b6" stroke-width="2" />' +
          '</svg>';
      }

      function renderMonitoringCharts(series) {
        const requests = series.map(bucket => [bucket.ts, (bucket.total.count / 10) * 60]);
        const errors = series.map(bucket => [bucket.ts, (bucket.total.errors / 10) * 60]);
        const latency = series.map(bucket => {
          const samples = bucket.total.latency_samples || [];
          if (!samples.length) return [bucket.ts, 0];
          const sum = samples.reduce((acc, val) => acc + val, 0);
          return [bucket.ts, sum / samples.length];
        });

        const requestBox = document.querySelector('[data-monitor-chart="requests"]');
        const errorBox = document.querySelector('[data-monitor-chart="errors"]');
        const latencyBox = document.querySelector('[data-monitor-chart="latency"]');
        const requestValue = document.querySelector('[data-monitor-value="requests"]');
        const errorValue = document.querySelector('[data-monitor-value="errors"]');
        const latencyValue = document.querySelector('[data-monitor-value="latency"]');
        const latestRequest = requests.length ? requests[requests.length - 1][1] : null;
        const latestError = errors.length ? errors[errors.length - 1][1] : null;
        const latestLatency = latency.length ? latency[latency.length - 1][1] : null;
        if (requestBox) requestBox.innerHTML = buildSparkline(requests);
        if (errorBox) errorBox.innerHTML = buildSparkline(errors);
        if (latencyBox) latencyBox.innerHTML = buildSparkline(latency);
        if (requestValue) requestValue.textContent = formatChartRate(latestRequest);
        if (errorValue) errorValue.textContent = formatChartRate(latestError);
        if (latencyValue) latencyValue.textContent = formatLatencyValue(latestLatency);
      }

      function renderEndpoints(endpoints) {
        const tbody = document.querySelector('[data-monitor-endpoints]');
        if (!tbody) return;
        const rows = Object.entries(endpoints || {})
          .map(([key, stats]) => (
            '<tr>' +
            '<td>' + escapeHtml(key.toUpperCase()) + '</td>' +
            '<td>' + Number(stats.per_minute || 0).toFixed(2) + '</td>' +
            '<td>' + (Number(stats.error_rate || 0) * 100).toFixed(2) + '%</td>' +
            '<td>' + Number(stats.avg_latency_ms || 0).toFixed(1) + '</td>' +
            '<td>' + Number(stats.p95_latency_ms || 0).toFixed(1) + '</td>' +
            '</tr>'
          ))
          .join('');
        tbody.innerHTML = rows || '<tr><td colspan="5">No data</td></tr>';
      }

      function renderQueues(queues) {
        const container = document.querySelector('[data-monitor-queues]');
        if (!container) return;
        const cards = Object.entries(queues || {})
          .map(([key, stats]) => (
            '<div class="stat-card">' +
            '<div class="stat-value">' + stats.active + ' / ' + stats.queued + '</div>' +
            '<div class="stat-label">' + escapeHtml(key.toUpperCase()) + ' (active/queued)</div>' +
            '</div>'
          ))
          .join('');
        container.innerHTML = cards || '<div class="stat-card"><div class="stat-value">0</div><div class="stat-label">No queues</div></div>';
      }

      function renderRules(rules) {
        const tbody = document.querySelector('[data-monitor-rules]');
        if (!tbody) return;
        const rows = (rules || [])
          .map(rule => (
            '<tr>' +
            '<td>' + escapeHtml(rule.name || '') + '</td>' +
            '<td>' + escapeHtml(rule.metric_key || '') + '</td>' +
            '<td>' + escapeHtml(rule.operator || '') + ' ' + escapeHtml(rule.threshold) + '</td>' +
            '<td>' + escapeHtml(rule.scope?.endpoint || 'global') + '</td>' +
            '<td>' + escapeHtml(rule.severity || '') + '</td>' +
            '<td>' +
            (rule.enabled
              ? '<span class="badge badge--enabled">Yes</span>'
              : '<span class="badge badge--disabled">No</span>') +
            '</td>' +
            '<td class="table-actions">' +
            '<div class="action-buttons">' +
            '<button class="secondary" data-rule-edit="' + rule.id + '">Edit</button>' +
            '<button class="secondary" data-rule-toggle="' + rule.id + '">' + (rule.enabled ? 'Disable' : 'Enable') + '</button>' +
            '<button class="warn" data-rule-delete="' + rule.id + '">Delete</button>' +
            '</div>' +
            '</td>' +
            '</tr>'
          ))
          .join('');
        tbody.innerHTML = rows || '<tr><td colspan="7">No rules</td></tr>';
      }

      function renderActiveAlerts(alerts) {
        const tbody = document.querySelector('[data-monitor-active]');
        if (!tbody) return;
        const rows = (alerts || [])
          .map(alert => (
            '<tr>' +
            '<td>' + escapeHtml(alert.name || '') + '</td>' +
            '<td>' + escapeHtml(alert.metric_key || '') + '</td>' +
            '<td>' + escapeHtml(alert.scope?.endpoint || 'global') + '</td>' +
            '<td>' + escapeHtml(alert.last_value || '') + '</td>' +
            '<td>' + escapeHtml(alert.last_change_at || '') + '</td>' +
            '<td>' +
            '<button class="secondary" data-alert-ack="' + alert.rule_id + '">Ack</button>' +
            '<button class="secondary" data-alert-silence="' + alert.rule_id + '">Silence</button>' +
            '</td>' +
            '</tr>'
          ))
          .join('');
        tbody.innerHTML = rows || '<tr><td colspan="6">No active alerts</td></tr>';
      }

      function renderResolvedAlerts(alerts) {
        const tbody = document.querySelector('[data-monitor-resolved]');
        if (!tbody) return;
        const rows = (alerts || [])
          .map(alert => (
            '<tr>' +
            '<td>' + escapeHtml(alert.name || '') + '</td>' +
            '<td>' + escapeHtml(alert.metric_key || '') + '</td>' +
            '<td>' + escapeHtml(alert.scope?.endpoint || 'global') + '</td>' +
            '<td>' + escapeHtml(alert.last_value || '') + '</td>' +
            '<td>' + escapeHtml(alert.last_change_at || '') + '</td>' +
            '</tr>'
          ))
          .join('');
        tbody.innerHTML = rows || '<tr><td colspan="5">No resolved alerts</td></tr>';
      }

      function setRuleForm(rule = {}) {
        document.querySelector('[data-rule-id]').value = rule.id || '';
        document.querySelector('[data-rule-name]').value = rule.name || '';
        document.querySelector('[data-rule-metric]').value = rule.metric_key || 'cpu_percent';
        document.querySelector('[data-rule-endpoint]').value = rule.scope?.endpoint || '';
        document.querySelector('[data-rule-operator]').value = rule.operator || '>';
        document.querySelector('[data-rule-threshold]').value = rule.threshold ?? '';
        document.querySelector('[data-rule-for]').value = rule.for_sec ?? '';
        document.querySelector('[data-rule-interval]').value = rule.eval_interval_sec ?? 10;
        document.querySelector('[data-rule-cooldown]').value = rule.cooldown_sec ?? 0;
        document.querySelector('[data-rule-severity]').value = rule.severity || 'warn';
        const emailToggle = document.querySelector('[data-rule-channel-email]');
        if (emailToggle) emailToggle.checked = rule.channels?.email !== false;
        const telegramToggle = document.querySelector('[data-rule-channel-telegram]');
        if (telegramToggle) telegramToggle.checked = rule.channels?.telegram !== false;
        document.querySelector('[data-rule-enabled]').checked = Boolean(rule.enabled);
        if (window.adminSettings?.alerts) {
          updateRuleChannelVisibility(window.adminSettings.alerts);
        }
      }

      let editingRuleId = null;

      function setRuleEditingState(ruleId) {
        editingRuleId = ruleId ? String(ruleId) : null;
        const idInput = document.querySelector('[data-rule-id]');
        if (idInput) idInput.value = editingRuleId || '';
      }

      async function saveRule() {
        const emailToggle = document.querySelector('[data-rule-channel-email]');
        const telegramToggle = document.querySelector('[data-rule-channel-telegram]');
        const payload = {
          id: editingRuleId || null,
          name: document.querySelector('[data-rule-name]').value,
          metric_key: document.querySelector('[data-rule-metric]').value,
          operator: document.querySelector('[data-rule-operator]').value,
          threshold: Number(document.querySelector('[data-rule-threshold]').value),
          for_sec: Number(document.querySelector('[data-rule-for]').value || 0),
          eval_interval_sec: Number(document.querySelector('[data-rule-interval]').value || 10),
          cooldown_sec: Number(document.querySelector('[data-rule-cooldown]').value || 0),
          severity: document.querySelector('[data-rule-severity]').value,
          enabled: document.querySelector('[data-rule-enabled]').checked,
          scope: {
            endpoint: document.querySelector('[data-rule-endpoint]').value || null,
          },
          channels: {
            email: emailToggle ? emailToggle.checked : false,
            telegram: telegramToggle ? telegramToggle.checked : false,
          },
        };
        const result = await fetchJson(baseUrl + '/api/monitoring/alerts/rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!result || result.ok !== true) {
          throw new Error('Unable to save alert rule.');
        }
        await refreshMonitoring();
        closeRuleModal();
      }

      async function toggleRule(ruleId) {
        const rules = await fetchJson(baseUrl + '/api/monitoring/alerts/rules');
        const rule = rules.find(item => String(item.id) === String(ruleId));
        if (!rule) return;
        rule.enabled = !rule.enabled;
        await fetchJson(baseUrl + '/api/monitoring/alerts/rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(rule),
        });
        await refreshMonitoring();
      }

      async function deleteRuleById(ruleId) {
        await fetchJson(baseUrl + '/api/monitoring/alerts/rules/' + ruleId + '/delete', {
          method: 'POST',
        });
        await refreshMonitoring();
      }

      async function ackRule(ruleId) {
        const duration = Number(prompt('Ack duration (seconds)', '600')) || 0;
        if (!duration) return;
        await fetchJson(baseUrl + '/api/monitoring/alerts/' + ruleId + '/ack', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ duration_sec: duration }),
        });
        await refreshMonitoring();
      }

      async function silenceRule(ruleId) {
        const duration = Number(prompt('Silence duration (seconds)', '900')) || 0;
        if (!duration) return;
        await fetchJson(baseUrl + '/api/monitoring/alerts/' + ruleId + '/silence', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ duration_sec: duration }),
        });
        await refreshMonitoring();
      }

      function openRuleModal(mode, rule) {
        const backdrop = document.getElementById('ruleModalBackdrop');
        if (!backdrop) return;
        const title = document.getElementById('ruleModalTitle');
        const errorBox = document.querySelector('[data-rule-error]');
        if (mode === 'edit' && rule) {
          setRuleEditingState(rule.id);
          setRuleForm(rule);
          if (title) title.textContent = 'EDIT ALERT RULE';
        } else {
          setRuleEditingState(null);
          setRuleForm({});
          if (title) title.textContent = 'NEW ALERT RULE';
        }
        clearError(errorBox);
        backdrop.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        window.__ruleModalOpen = true;
      }

      function closeRuleModal() {
        const backdrop = document.getElementById('ruleModalBackdrop');
        if (!backdrop) return;
        backdrop.style.display = 'none';
        document.body.style.overflow = '';
        window.__ruleModalOpen = false;
        setRuleEditingState(null);
        setRuleForm({});
        clearError(document.querySelector('[data-rule-error]'));
      }

      async function refreshMonitoring() {
        try {
          const [metrics, rules, active, resolved] = await Promise.all([
            fetchJson(baseUrl + '/api/monitoring/metrics'),
            fetchJson(baseUrl + '/api/monitoring/alerts/rules'),
            fetchJson(baseUrl + '/api/monitoring/alerts/active'),
            fetchJson(baseUrl + '/api/monitoring/alerts/resolved'),
          ]);

          const rangeSeconds = Number(document.querySelector('[data-monitor-range]')?.value || 900);
          const now = Date.now();
          const series = await fetchJson(
            baseUrl + '/api/monitoring/range?from=' + (now - rangeSeconds * 1000) + '&to=' + now + '&bucket_sec=10'
          );

          document.querySelector('[data-metric="cpu"]').textContent = metrics.process.cpu_percent.toFixed(1) + '%';
          document.querySelector('[data-metric="rss"]').textContent = (metrics.process.memory_rss_bytes / 1024 / 1024).toFixed(1) + ' MB';
          document.querySelector('[data-metric="heap"]').textContent =
            (metrics.process.heap_used_bytes / 1024 / 1024).toFixed(1) + '/' +
            (metrics.process.heap_total_bytes / 1024 / 1024).toFixed(1) + ' MB';
          document.querySelector('[data-metric="loop"]').textContent = metrics.process.event_loop_delay_ms.toFixed(1) + ' ms';
          document.querySelector('[data-metric="uptime"]').textContent = Math.floor(metrics.process.uptime_sec) + 's';
          document.querySelector('[data-metric="db"]').textContent = metrics.db.status;
          document.querySelector('[data-metric="req"]').textContent = metrics.requests.per_minute_global.toFixed(1);
          document.querySelector('[data-metric="errors"]').textContent = metrics.requests.errors_per_minute.toFixed(1);
          document.querySelector('[data-metric="timeouts"]').textContent = metrics.requests.timeouts_per_minute.toFixed(1);

          renderEndpoints(metrics.endpoints);
          renderQueues(metrics.queues);
          renderMonitoringCharts(series);
          renderRules(rules);
          renderActiveAlerts(active);
          renderResolvedAlerts(resolved);
        } catch (err) {
          showToast('Monitoring refresh failed: ' + err.message, 'error');
        }
      }

      let monitorTimer = null;
      function scheduleMonitoringRefresh() {
        if (monitorTimer) clearInterval(monitorTimer);
        const interval = Number(document.querySelector('[data-monitor-refresh]')?.value || 0);
        if (interval > 0) {
          monitorTimer = setInterval(refreshMonitoring, interval);
        }
      }

      function getInitialTab() {
        const hash = window.location.hash ? window.location.hash.slice(1) : '';
        if (tabKeys.includes(hash)) return hash;
        try {
          const stored = window.localStorage.getItem(tabStorageKey);
          if (tabKeys.includes(stored)) return stored;
        } catch {}
        return 'monitoring';
      }

      document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setActiveTab(tab.dataset.tab)));
      setActiveTab(getInitialTab());
      const monitorRefresh = document.querySelector('[data-monitor-refresh]');
      const monitorRange = document.querySelector('[data-monitor-range]');
      const monitorNow = document.querySelector('[data-monitor-refresh-now]');
      if (monitorRefresh) monitorRefresh.addEventListener('change', () => {
        scheduleMonitoringRefresh();
      });
      if (monitorRange) monitorRange.addEventListener('change', refreshMonitoring);
      if (monitorNow) monitorNow.addEventListener('click', refreshMonitoring);
      scheduleMonitoringRefresh();
      refreshMonitoring();

      const ruleSave = document.querySelector('[data-rule-save]');
      const ruleErrorBox = document.querySelector('[data-rule-error]');
      if (ruleSave) ruleSave.addEventListener('click', () => {
        setButtonLoading(ruleSave, true, 'Saving...');
        saveRule()
          .catch(err => {
            showError(ruleErrorBox, 'Save failed: ' + err.message);
          })
          .finally(() => setButtonLoading(ruleSave, false));
      });
      const ruleCancel = document.querySelector('[data-rule-cancel]');
      if (ruleCancel) ruleCancel.addEventListener('click', () => {
        closeRuleModal();
      });
      const ruleNew = document.querySelector('[data-monitor-rule-new]');
      if (ruleNew) ruleNew.addEventListener('click', () => {
        openRuleModal('new');
      });
      document.addEventListener('click', event => {
        const editId = event.target.getAttribute('data-rule-edit');
        const deleteId = event.target.getAttribute('data-rule-delete');
        const toggleId = event.target.getAttribute('data-rule-toggle');
        const ackId = event.target.getAttribute('data-alert-ack');
        const silenceId = event.target.getAttribute('data-alert-silence');
        if (editId) {
          fetchJson(baseUrl + '/api/monitoring/alerts/rules').then(rules => {
            const rule = rules.find(item => String(item.id) === String(editId));
            if (rule) {
              openRuleModal('edit', rule);
            }
          });
        }
        if (deleteId) deleteRuleById(deleteId);
        if (toggleId) toggleRule(toggleId);
        if (ackId) ackRule(ackId);
        if (silenceId) silenceRule(silenceId);
      });

      function syncModalBody(channel) {
        const modalBody = document.getElementById('logModalBody');
        if (!modalBody || !window.__logModalOpen) return;
        if (window.__logModalChannel !== channel) return;
        const viewer = document.querySelector('[data-log-viewer="' + channel + '"]');
        if (viewer) modalBody.textContent = viewer.textContent || '';
      }

      function closeLogModal() {
        const backdrop = document.getElementById('logModalBackdrop');
        if (!backdrop) return;
        backdrop.style.display = 'none';
        document.body.style.overflow = '';
        window.__logModalOpen = false;
        window.__logModalChannel = null;
      }

      function openLogModal(channel) {
        const backdrop = document.getElementById('logModalBackdrop');
        const title = document.getElementById('logModalTitle');
        const body = document.getElementById('logModalBody');
        const actions = document.getElementById('logModalActions');
        if (!backdrop || !title || !body || !actions) return;
        title.textContent = channel.toUpperCase() + ' LOGS';
        const viewer = document.querySelector('[data-log-viewer="' + channel + '"]');
        body.textContent = viewer ? viewer.textContent || '' : '';
        actions.innerHTML = '';

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = 'Refresh';
        refreshBtn.className = 'secondary';
        refreshBtn.addEventListener('click', async () => {
          setButtonLoading(refreshBtn, true, 'Refreshing');
          try {
            await refreshLogs(channel, { showStatus: true });
            syncModalBody(channel);
          } finally {
            setButtonLoading(refreshBtn, false);
          }
        });
        actions.appendChild(refreshBtn);

        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export';
        exportBtn.className = 'secondary';
        exportBtn.addEventListener('click', () => {
          const statusBox = document.querySelector('[data-log-status="' + channel + '"]');
          setButtonLoading(exportBtn, true, 'Exporting');
          showStatus(statusBox, 'Export started ✓ · ' + formatTime());
          window.location = baseUrl + '/api/logs/' + channel + '/export';
          setTimeout(() => {
            setButtonLoading(exportBtn, false);
          }, 900);
        });
        actions.appendChild(exportBtn);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.className = 'warn';
        clearBtn.addEventListener('click', async () => {
          setButtonLoading(clearBtn, true, 'Clearing');
          try {
            await clearChannel(channel);
            syncModalBody(channel);
          } finally {
            setButtonLoading(clearBtn, false);
          }
        });
        actions.appendChild(clearBtn);

        window.__logModalOpen = true;
        window.__logModalChannel = channel;
        backdrop.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        showToast('Opened ' + channel.toUpperCase() + ' modal', 'success');
        refreshLogs(channel, { showStatus: false })
          .then(() => syncModalBody(channel))
          .catch(() => {});
      }

      document.querySelectorAll('[data-refresh]').forEach(btn => {
        btn.addEventListener('click', async () => {
          setButtonLoading(btn, true, 'Refreshing');
          try {
            await refreshLogs(btn.dataset.refresh, { showStatus: true });
          } finally {
            setButtonLoading(btn, false);
          }
        });
      });
      document.querySelectorAll('[data-save]').forEach(btn => {
        btn.addEventListener('click', async () => {
          setButtonLoading(btn, true, 'Saving');
          try {
            await saveChannel(btn.dataset.save);
          } finally {
            setButtonLoading(btn, false);
          }
        });
      });
      document.querySelectorAll('[data-clear]').forEach(btn => {
        btn.addEventListener('click', async () => {
          setButtonLoading(btn, true, 'Clearing');
          try {
            await clearChannel(btn.dataset.clear);
          } finally {
            setButtonLoading(btn, false);
          }
        });
      });
      document.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => {
          const statusBox = document.querySelector('[data-log-status="' + btn.dataset.export + '"]');
          setButtonLoading(btn, true, 'Exporting');
          showStatus(statusBox, 'Export started ✓ · ' + formatTime());
          window.location = baseUrl + '/api/logs/' + btn.dataset.export + '/export';
          setTimeout(() => {
            setButtonLoading(btn, false);
          }, 900);
        });
      });
      document.querySelectorAll('[data-expand]').forEach(btn => {
        btn.addEventListener('click', () => {
          openLogModal(btn.dataset.expand);
        });
      });

      const subscriptionEventsRefresh = document.querySelector('[data-subscription-events-refresh]');
      if (subscriptionEventsRefresh) {
        subscriptionEventsRefresh.addEventListener('click', async () => {
          setButtonLoading(subscriptionEventsRefresh, true, 'Refreshing');
          try {
            await refreshSubscriptionEvents({ showStatus: true });
          } finally {
            setButtonLoading(subscriptionEventsRefresh, false);
          }
        });
      }
      const subscriptionEventsSave = document.querySelector('[data-subscription-events-save]');
      if (subscriptionEventsSave) {
        subscriptionEventsSave.addEventListener('click', async () => {
          setButtonLoading(subscriptionEventsSave, true, 'Saving');
          try {
            await saveSubscriptionEventSettings();
          } finally {
            setButtonLoading(subscriptionEventsSave, false);
          }
        });
      }
      const subscriptionEventsExportFiltered = document.querySelector('[data-subscription-events-export-filtered]');
      if (subscriptionEventsExportFiltered) {
        subscriptionEventsExportFiltered.addEventListener('click', () => exportSubscriptionEvents(false));
      }
      const subscriptionEventsExportAll = document.querySelector('[data-subscription-events-export-all]');
      if (subscriptionEventsExportAll) {
        subscriptionEventsExportAll.addEventListener('click', () => exportSubscriptionEvents(true));
      }
      const subscriptionEventsClear = document.querySelector('[data-subscription-events-clear]');
      if (subscriptionEventsClear) {
        subscriptionEventsClear.addEventListener('click', async () => {
          setButtonLoading(subscriptionEventsClear, true, 'Clearing');
          try {
            clearSubscriptionEventsFilters();
            await refreshSubscriptionEvents({ showStatus: true });
          } finally {
            setButtonLoading(subscriptionEventsClear, false);
          }
        });
      }
      const subscriptionEventsExpand = document.querySelector('[data-subscription-events-expand]');
      if (subscriptionEventsExpand) {
        subscriptionEventsExpand.addEventListener('click', () => {
          openSubscriptionEventsModal();
        });
      }

      const alertSave = document.querySelector('[data-alert-save]');
      if (alertSave) {
        alertSave.addEventListener('click', async () => {
          setButtonLoading(alertSave, true, 'Saving');
          try {
            await saveAlerts();
          } finally {
            setButtonLoading(alertSave, false);
          }
        });
      }
      const alertTest = document.querySelector('[data-alert-test]');
      if (alertTest) {
        alertTest.addEventListener('click', async () => {
          const errorBox = document.querySelector('[data-alert-error]');
          const statusBox = document.querySelector('[data-alert-status]');
          setButtonLoading(alertTest, true, 'Sending');
          try {
            await fetchJson(baseUrl + '/api/alerts/test', { method: 'POST' });
            clearError(errorBox);
            showStatus(statusBox, 'Test sent ✓ · ' + formatTime());
          } catch (err) {
            const status = err?.status ? ' (status ' + err.status + ')' : '';
            const message = 'Unable to send test alert' + status + ': ' + err.message;
            showError(errorBox, message);
            showToast(message, 'error');
          } finally {
            setButtonLoading(alertTest, false);
          }
        });
      }

      refreshSettings()
        .then(() => {
          channels.forEach(channel => refreshLogs(channel));
        })
        .catch(() => {
          // errors already surfaced in UI
        });
      refreshSubscriptionEventSettings().catch(() => {});
      refreshSubscriptionEvents().catch(() => {});
      setInterval(() => {
        channels.forEach(channel => refreshLogs(channel));
      }, 10000);

      const backdrop = document.getElementById('logModalBackdrop');
      const closeBtn = document.getElementById('logModalClose');
      if (closeBtn) closeBtn.addEventListener('click', closeLogModal);
      if (backdrop) {
        backdrop.addEventListener('click', event => {
          if (event.target === backdrop) closeLogModal();
        });
      }
      const ruleBackdrop = document.getElementById('ruleModalBackdrop');
      const ruleClose = document.getElementById('ruleModalClose');
      if (ruleClose) ruleClose.addEventListener('click', closeRuleModal);
      if (ruleBackdrop) {
        ruleBackdrop.addEventListener('click', event => {
          if (event.target === ruleBackdrop) closeRuleModal();
        });
      }
      const subscriptionEventsBackdrop = document.getElementById('subscriptionEventsModalBackdrop');
      const subscriptionEventsClose = document.getElementById('subscriptionEventsModalClose');
      if (subscriptionEventsClose) subscriptionEventsClose.addEventListener('click', closeSubscriptionEventsModal);
      if (subscriptionEventsBackdrop) {
        subscriptionEventsBackdrop.addEventListener('click', event => {
          if (event.target === subscriptionEventsBackdrop) closeSubscriptionEventsModal();
        });
      }
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && window.__logModalOpen) {
          closeLogModal();
        }
        if (event.key === 'Escape' && window.__ruleModalOpen) {
          closeRuleModal();
        }
        if (event.key === 'Escape' && window.__subscriptionEventsModalOpen) {
          closeSubscriptionEventsModal();
        }
      });
    });
  `;
}

function inlineAdminScript(baseUrl) {
  return `const baseUrl = ${JSON.stringify(baseUrl)};
${buildAdminScript(baseUrl)}`;
}

function renderLayout({ baseUrl, csrfToken, content, title = 'PixLab Admin Desk' }) {
  const buildStamp = 'ADMIN_UI_BUILD_STAMP: 2025-02-14T00:00:00Z';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="${csrfToken}" />
  <meta name="admin-ui-build-stamp" content="${buildStamp}" />
  <title>${title}</title>
  <!-- ${buildStamp} -->
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #0f172a; color: #e2e8f0; }
    header { background: #111827; padding: 16px 24px; border-bottom: 1px solid #1f2937; }
    h1 { margin: 0; font-size: 20px; }
    main { padding: 24px; }
    .tabs { display: flex; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
    .tab { padding: 8px 14px; border-radius: 6px; background: #1f2937; cursor: pointer; }
    .tab.active { background: #2563eb; }
    .panel { display: none; }
    .panel.active { display: block; }
    .card { background: #111827; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #1f2937; }
    .stats-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .overview-grid { display: grid; gap: 16px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stat-card--wide { grid-column: 1 / -1; }
    .stat-card { background: #0b1220; padding: 14px; border-radius: 8px; border: 1px solid #1f2937; }
    .stat-value { font-size: 18px; font-weight: 600; }
    .stat-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .charts-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .chart-card { background: #0b1220; padding: 14px; border-radius: 8px; border: 1px solid #1f2937; }
    .chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; }
    .chart-title { font-size: 12px; color: #94a3b8; margin: 0; }
    .chart-metric { font-size: 12px; color: #fbcfe8; font-weight: 600; }
    .chart-body { min-height: 80px; }
    .chart-body svg { width: 100%; height: 80px; }
    .table-compact th, .table-compact td { font-size: 12px; }
    label { display: block; font-size: 12px; margin-bottom: 4px; color: #94a3b8; }
    .field-help { margin-top: 6px; font-size: 12px; color: #94a3b8; }
    input, select, textarea { width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; }
    button { padding: 9px 12px; border: none; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer; }
    button.secondary { background: #475569; }
    button.warn { background: #dc2626; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .log-viewer { background: #0b1220; border: 1px solid #1f2937; padding: 12px; border-radius: 8px; height: 220px; overflow: auto; font-family: monospace; font-size: 12px; margin-top: 20px; }
    .table-wrap { width: 100%; overflow-x: auto; border: 1px solid #1f2937; border-radius: 8px; background: #0b1220; margin-top: 20px; }
    .table { width: 100%; border-collapse: collapse; min-width: 820px; }
    .table th, .table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #1f2937; font-size: 12px; vertical-align: top; }
    .table thead th { position: sticky; top: 0; background: #0f172a; color: #e2e8f0; }
    .table-actions { text-align: right; }
    .action-buttons { display: inline-flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .modal-body-table { padding: 16px 18px 20px; overflow: auto; background: #0b1220; border-top: 1px solid #1f2937; margin: 20px 18px 18px; border-radius: 8px; }
    .modal-body-form { padding: 18px; overflow: auto; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 0 18px 18px; }
    .badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; background: #1f2937; }
    .badge--enabled { background: #14532d; color: #bbf7d0; border: 1px solid #22c55e; }
    .badge--disabled { background: #7f1d1d; color: #fecaca; border: 1px solid #ef4444; }
    .row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .error-box { background: #1f2937; border: 1px solid #f87171; color: #fecaca; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; }
    .log-meta { font-size: 11px; color: #94a3b8; margin-top: 6px; }
    .status-box { display: none; }
    .controls { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 16px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .fields { margin-bottom: 16px; }
    .filters { margin-top: 18px; }
    .tokens { margin: 8px 0 0; padding-left: 18px; color: #cbd5f5; font-size: 12px; display: grid; gap: 4px; }
    .tokens li { list-style: disc; }
    .tokens-wrap { margin-top: 16px; }
    .tokens-wrap label { margin-bottom: 8px; }
    .toggle-group { display: flex; align-items: center; gap: 10px; }
    .toggle-text { font-size: 12px; color: #e2e8f0; }
    .channel-row { align-items: center; gap: 10px; }
    .channel-empty { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .switch-slider { position: absolute; cursor: pointer; inset: 0; background: #334155; transition: 0.2s; border-radius: 999px; }
    .switch-slider:before { position: absolute; content: ''; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; transition: 0.2s; border-radius: 50%; }
    .switch input:checked + .switch-slider { background: #22c55e; }
    .switch input:checked + .switch-slider:before { transform: translateX(20px); }
    .toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 100; padding: 10px 16px; border-radius: 999px; font-size: 13px; border: 1px solid transparent; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); }
    .toast--success { background: #0f1f16; color: #bbf7d0; border-color: #1f4d39; }
    .toast--error { background: #2b0f13; color: #fecaca; border-color: #ef4444; }
    .btn-content { display: inline-flex; align-items: center; gap: 8px; }
    .spinner { width: 14px; height: 14px; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.75); display: none; align-items: center; justify-content: center; z-index: 50; padding: 24px; }
    .modal { background: #0f172a; border: 1px solid #1f2937; border-radius: 10px; width: min(960px, 95vw); max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid #1f2937; }
    .modal-title { font-size: 14px; font-weight: 600; letter-spacing: 0.04em; }
    .modal-close { background: #1f2937; color: #e2e8f0; border-radius: 6px; padding: 6px 10px; }
    .modal-actions { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 18px 0; }
    .modal-body { padding: 16px 18px 20px; overflow: auto; font-family: monospace; font-size: 12px; background: #0b1220; border-top: 1px solid #1f2937; margin: 12px 18px 18px; border-radius: 8px; white-space: pre-wrap; }
    @media (max-width: 900px) {
      main { padding: 20px; }
      .card { padding: 18px; }
      .controls { align-items: flex-start; }
      .actions { width: 100%; }
      .overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      header { padding: 14px 18px; }
      main { padding: 16px; }
      .grid { grid-template-columns: 1fr; gap: 14px; }
      .overview-grid { grid-template-columns: 1fr; }
      .row { gap: 12px; }
      .actions { flex-direction: column; align-items: stretch; }
      .toggle-group { flex-direction: column; align-items: center; gap: 6px; }
      .tokens-wrap { margin-top: 18px; }
      .tokens { gap: 6px; }
      .modal { width: 100%; }
      .modal-body { margin: 12px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="row" style="justify-content: space-between;">
      <h1>${title}</h1>
      <a href="${baseUrl}/logout" style="color:#93c5fd;text-decoration:none;">Logout</a>
    </div>
  </header>
  <div id="globalToast" class="toast toast--success" style="display:none;"></div>
  <div id="js-status" style="background:#7f1d1d;color:#fecaca;padding:8px 16px;border-bottom:1px solid #991b1b;">
    JavaScript is required for the admin controls. If this banner stays visible, the admin script did not run.
  </div>
  <main>
    ${content}
  </main>
  <script>
    ${inlineAdminScript(baseUrl)}
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
    .card { background: #111827; padding: 28px 30px; border-radius: 10px; width: 380px; border: 1px solid #1f2937; }
    label { display: block; font-size: 12px; margin-bottom: 4px; color: #94a3b8; }
    input { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; margin-bottom: 12px; box-sizing: border-box; }
    button { width: 100%; padding: 10px; border: none; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; box-sizing: border-box; }
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
        <div class="controls">
          <h3>${channel.toUpperCase()} <span class="badge ${cfg.enabled ? 'badge--enabled' : 'badge--disabled'}" data-channel-badge="${channel}">${cfg.enabled ? 'enabled' : 'disabled'}</span></h3>
          <div class="actions">
            ${!isAudit ? `<div class="toggle-group"><span class="toggle-text">Enabled</span><label class="switch"><input type="checkbox" data-toggle="${channel}" /><span class="switch-slider"></span></label></div>` : ''}
            <button class="secondary" data-refresh="${channel}">Refresh</button>
            <button class="secondary" data-expand="${channel}">Expand</button>
            <button class="secondary" data-export="${channel}">Export</button>
            <button class="warn" data-clear="${channel}">Clear</button>
            <button data-save="${channel}">Save</button>
          </div>
        </div>
        <div class="grid fields">
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
            <label>Max size (MB)</label>
            <input type="number" data-maxbytes="${channel}" />
          </div>
          <div>
            <label>Retention days</label>
            <input type="number" data-retention="${channel}" />
          </div>
        </div>
        <div class="grid filters">
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
            <label>Since</label>
            <input type="datetime-local" data-filter-since="${channel}" />
          </div>
          <div>
            <label>Until</label>
            <input type="datetime-local" data-filter-until="${channel}" />
          </div>
        </div>
        <div class="log-viewer" data-log-viewer="${channel}"></div>
        <div class="log-meta" data-log-meta="${channel}">Last loaded: never</div>
        <div class="status-box" data-log-status="${channel}" style="display:none;"></div>
        <div class="error-box" data-log-error="${channel}" style="display:none;"></div>
      </div>`;
    })
    .join('');

  const content = `
    <div class="tabs">
      <div class="tab active" data-tab="monitoring">Monitoring</div>
      <div class="tab" data-tab="debug">Debug Logs</div>
      <div class="tab" data-tab="alerts">Alerting</div>
    </div>
    <section class="panel" id="debug">
      ${channelSections}
      <div class="card">
        <div class="controls">
          <h3>Subscription Events <span class="badge badge--disabled" data-subscription-events-badge>disabled</span></h3>
          <div class="actions">
            <button class="secondary" data-subscription-events-refresh>Refresh</button>
            <button class="secondary" data-subscription-events-expand>Expand</button>
            <button class="secondary" data-subscription-events-export-filtered>Export Filtered</button>
            <button class="secondary" data-subscription-events-export-all>Export All</button>
            <button class="warn" data-subscription-events-clear>Clear Filters</button>
            <button data-subscription-events-save>Save</button>
          </div>
        </div>
        <div class="grid fields">
          <div>
            <label>Enabled</label>
            <label class="switch"><input type="checkbox" data-subscription-events-enabled /><span class="switch-slider"></span></label>
          </div>
          <div>
            <label>Retention days</label>
            <input type="number" data-subscription-events-retention />
          </div>
        </div>
        <div class="grid filters">
          <div>
            <label>Event ID</label>
            <input data-subscription-events-filter="event_id" />
          </div>
          <div>
            <label>WP User ID</label>
            <input data-subscription-events-filter="wp_user_id" />
          </div>
          <div>
            <label>Customer Email</label>
            <input data-subscription-events-filter="customer_email" />
          </div>
          <div>
            <label>Subscription ID</label>
            <input data-subscription-events-filter="subscription_id" />
          </div>
          <div>
            <label>Order ID</label>
            <input data-subscription-events-filter="order_id" />
          </div>
          <div>
            <label>Event Type</label>
            <input data-subscription-events-filter="event_type" />
          </div>
          <div>
            <label>Plan Slug</label>
            <input data-subscription-events-filter="plan_slug" />
          </div>
          <div>
            <label>Decision</label>
            <input data-subscription-events-filter="decision" />
          </div>
          <div>
            <label>Received From</label>
            <input type="datetime-local" data-subscription-events-filter="received_from" />
          </div>
          <div>
            <label>Received Until</label>
            <input type="datetime-local" data-subscription-events-filter="received_until" />
          </div>
          <div>
            <label>Limit</label>
            <input data-subscription-events-filter="limit" value="50" />
          </div>
          <div>
            <label>Offset</label>
            <input data-subscription-events-filter="offset" value="0" />
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Event ID</th>
                <th>Event Type</th>
                <th>Subscription ID</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Decision</th>
                <th>API Key ID</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody data-subscription-events-table-body></tbody>
          </table>
        </div>
        <div class="log-meta" data-subscription-events-meta>Total: 0</div>
        <div class="status-box" data-subscription-events-status style="display:none;"></div>
        <div class="error-box" data-subscription-events-error style="display:none;"></div>
      </div>
    </section>
    <section class="panel active" id="monitoring">
      <div class="card">
        <div class="controls">
          <h3>Monitoring Overview</h3>
          <div class="actions">
            <label>Range
              <select data-monitor-range>
                <option value="900">Last 15m</option>
                <option value="3600">Last 1h</option>
                <option value="21600">Last 6h</option>
              </select>
            </label>
            <label>Refresh
              <select data-monitor-refresh>
                <option value="5000">5s</option>
                <option value="10000">10s</option>
                <option value="30000">30s</option>
                <option value="0">Manual</option>
              </select>
            </label>
            <button class="secondary" data-monitor-refresh-now>Refresh now</button>
          </div>
        </div>
        <div class="overview-grid">
          <div class="stat-card">
            <div class="stat-value" data-metric="cpu">--</div>
            <div class="stat-label">CPU %</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="rss">--</div>
            <div class="stat-label">RSS</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="heap">--</div>
            <div class="stat-label">Heap</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="loop">--</div>
            <div class="stat-label">Event loop delay</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="uptime">--</div>
            <div class="stat-label">Uptime</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="db">--</div>
            <div class="stat-label">DB status</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="req">--</div>
            <div class="stat-label">Req/min</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="errors">--</div>
            <div class="stat-label">Errors/min</div>
          </div>
          <div class="stat-card stat-card--wide">
            <div class="stat-value" data-metric="timeouts">--</div>
            <div class="stat-label">Timeouts/min</div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Charts</h3>
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">Requests/min</div>
              <div class="chart-metric" data-monitor-value="requests">--</div>
            </div>
            <div class="chart-body" data-monitor-chart="requests"></div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">Errors/min</div>
              <div class="chart-metric" data-monitor-value="errors">--</div>
            </div>
            <div class="chart-body" data-monitor-chart="errors"></div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">Latency avg (ms)</div>
              <div class="chart-metric" data-monitor-value="latency">--</div>
            </div>
            <div class="chart-body" data-monitor-chart="latency"></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Queues</h3>
        <div class="grid" data-monitor-queues></div>
      </div>
      <div class="card">
        <h3>Endpoints</h3>
        <div class="table-wrap">
          <table class="table table-compact">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Req/min</th>
                <th>Error rate</th>
                <th>Avg latency (ms)</th>
                <th>P95 latency (ms)</th>
              </tr>
            </thead>
            <tbody data-monitor-endpoints></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Alert Rules</h3>
        <div class="row">
          <button class="secondary" data-monitor-rule-new>New Rule</button>
        </div>
        <div class="table-wrap">
          <table class="table table-compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Metric</th>
                <th>Threshold</th>
                <th>Scope</th>
                <th>Severity</th>
                <th>Enabled</th>
                <th class="table-actions">Actions</th>
              </tr>
            </thead>
            <tbody data-monitor-rules></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Active Alerts</h3>
        <div class="table-wrap">
          <table class="table table-compact">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Metric</th>
                <th>Scope</th>
                <th>Value</th>
                <th>Since</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody data-monitor-active></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Resolved Alerts</h3>
        <div class="table-wrap">
          <table class="table table-compact">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Metric</th>
                <th>Scope</th>
                <th>Value</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody data-monitor-resolved></tbody>
          </table>
        </div>
      </div>
    </section>
    <section class="panel" id="alerts">
      <div class="error-box" data-alert-error style="display:none;"></div>
      <div class="status-box" data-alert-status style="display:none;"></div>
      <div class="card">
        <h3>Email Alerts</h3>
        <div class="grid">
          <div>
            <div class="toggle-group">
              <span class="toggle-text">Enabled</span>
              <label class="switch"><input type="checkbox" data-alert-email-enabled /><span class="switch-slider"></span></label>
            </div>
          </div>
          <div>
            <label>Recipients (comma separated)</label>
            <input data-alert-email-recipients />
          </div>
        </div>
        <label>Email Subject</label>
        <input data-alert-email-subject placeholder="${settings.alerts.email.subject_template || ''}" />
        <div class="field-help">You can use the same tokens as the email template.</div>
        <label>Template</label>
        <textarea rows="4" data-alert-email-template></textarea>
        <div class="tokens-wrap">
          <label>Available tokens</label>
          <ul class="tokens">
            ${Object.keys(templateTokens({})).map(t => '<li>{' + t + '}</li>').join('')}
          </ul>
        </div>
      </div>
      <div class="card">
        <h3>Telegram Alerts</h3>
        <div class="grid">
          <div>
            <div class="toggle-group">
              <span class="toggle-text">Enabled</span>
              <label class="switch"><input type="checkbox" data-alert-telegram-enabled /><span class="switch-slider"></span></label>
            </div>
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
      </div>
    </section>
    <div class="modal-backdrop" id="ruleModalBackdrop" style="display:none;">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ruleModalTitle">
        <div class="modal-header">
          <div class="modal-title" id="ruleModalTitle">ALERT RULE</div>
          <button class="modal-close" type="button" id="ruleModalClose" aria-label="Close">✕</button>
        </div>
        <div class="modal-body-form">
          <div class="error-box" data-rule-error style="display:none;"></div>
          <div class="grid fields">
            <div>
              <label>Name</label>
              <input data-rule-name />
            </div>
            <div>
              <label>Metric</label>
              <select data-rule-metric>
                <option value="cpu_percent">CPU %</option>
                <option value="memory_rss_bytes">Memory RSS</option>
                <option value="heap_used_bytes">Heap Used</option>
                <option value="event_loop_delay_ms">Event Loop Delay</option>
                <option value="req_per_min">Requests/min</option>
                <option value="errors_per_min">Errors/min</option>
                <option value="timeouts_per_min">Timeouts/min</option>
                <option value="error_rate">Error Rate</option>
                <option value="latency_avg_ms">Latency Avg</option>
                <option value="latency_p95_ms">Latency P95</option>
                <option value="queue_active">Queue Active</option>
                <option value="queue_queued">Queue Queued</option>
              </select>
            </div>
            <div>
              <label>Endpoint scope</label>
              <select data-rule-endpoint>
                <option value="">Global</option>
                <option value="h2i">h2i</option>
                <option value="image">image</option>
                <option value="pdf">pdf</option>
                <option value="tools">tools</option>
              </select>
            </div>
            <div>
              <label>Operator</label>
              <select data-rule-operator>
                <option value=">">></option>
                <option value=">=">>=</option>
                <option value="<"><</option>
                <option value="<="><=</option>
                <option value="==">==</option>
                <option value="!=">!=</option>
              </select>
            </div>
            <div>
              <label>Threshold</label>
              <input type="number" data-rule-threshold />
            </div>
            <div>
              <label>For (sec)</label>
              <input type="number" data-rule-for />
            </div>
            <div>
              <label>Eval interval (sec)</label>
              <input type="number" data-rule-interval />
            </div>
            <div>
              <label>Cooldown (sec)</label>
              <input type="number" data-rule-cooldown />
            </div>
            <div>
              <label>Severity</label>
              <select data-rule-severity>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </div>
            <div>
              <label>Channels</label>
              <div class="channel-toggles">
                <div class="row channel-row" data-rule-channel="email">
                  <label class="switch"><input type="checkbox" data-rule-channel-email /><span class="switch-slider"></span></label>
                  <span class="toggle-text">Email</span>
                </div>
                <div class="row channel-row" data-rule-channel="telegram">
                  <label class="switch"><input type="checkbox" data-rule-channel-telegram /><span class="switch-slider"></span></label>
                  <span class="toggle-text">Telegram</span>
                </div>
                <div class="channel-empty" data-rule-channel-empty style="display:none;">No channels enabled in Alerting settings.</div>
              </div>
            </div>
            <div>
              <label>Enabled</label>
              <label class="switch"><input type="checkbox" data-rule-enabled /><span class="switch-slider"></span></label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="secondary" type="button" data-rule-cancel>Cancel</button>
          <button type="button" data-rule-save>Save Rule</button>
          <input type="hidden" data-rule-id />
        </div>
      </div>
    </div>
    <div class="modal-backdrop" id="logModalBackdrop" style="display:none;">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="logModalTitle">
        <div class="modal-header">
          <div class="modal-title" id="logModalTitle">CHANNEL</div>
          <button class="modal-close" type="button" id="logModalClose" aria-label="Close">✕</button>
        </div>
        <div class="modal-actions" id="logModalActions"></div>
        <pre class="modal-body" id="logModalBody"></pre>
      </div>
    </div>
    <div class="modal-backdrop" id="subscriptionEventsModalBackdrop" style="display:none;">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="subscriptionEventsModalTitle">
        <div class="modal-header">
          <div class="modal-title" id="subscriptionEventsModalTitle">SUBSCRIPTION EVENTS</div>
          <button class="modal-close" type="button" id="subscriptionEventsModalClose" aria-label="Close">✕</button>
        </div>
        <div class="modal-actions" id="subscriptionEventsModalActions"></div>
        <div class="modal-body-table">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Event ID</th>
                  <th>Event Type</th>
                  <th>Subscription ID</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Decision</th>
                  <th>API Key ID</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody data-subscription-events-modal-body></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
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
      const { ip: clientIp } = extractClientInfo(req);
      const ip = clientIp || req.ip;
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
  router.get('/debug/admin-script', requireAuth, (req, res) => {
    res.type('text/plain').send(inlineAdminScript(buildBaseUrl(req)));
  });

  router.get('/api/settings', requireAuth, (req, res) => {
    sendJson(req, res, getSettings());
  });

  router.get('/api/logs/:channel', requireAuth, async (req, res) => {
    const { channel } = req.params;
    const items = await tailChannel(channel, req.query);
    sendJson(req, res, { items });
  });

  router.get('/api/subscription-events/settings', requireAuth, (req, res) => {
    sendJson(req, res, getSubscriptionEventSettings());
  });

  router.post('/api/subscription-events/settings', requireAuth, (req, res) => {
    const settings = updateSubscriptionEventSettings(req.body || {});
    logAudit('admin.subscription_events.settings.updated', { actor: 'admin' });
    sendJson(req, res, settings);
  });

  router.get('/api/subscription-events', requireAuth, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const filters = {
      event_id: req.query.event_id || null,
      wp_user_id: req.query.wp_user_id ? Number(req.query.wp_user_id) : null,
      customer_email: req.query.customer_email || null,
      subscription_id: req.query.subscription_id || null,
      order_id: req.query.order_id || null,
      event_type: req.query.event_type || null,
      plan_slug: req.query.plan_slug || null,
      decision: req.query.decision || null,
      received_from: toMysqlDateTime(req.query.received_from),
      received_until: toMysqlDateTime(req.query.received_until),
    };
    const data = await querySubscriptionEvents({ filters, limit, offset });
    sendJson(req, res, data);
  });

  router.get('/api/subscription-events/export', requireAuth, async (req, res) => {
    const filters = {
      event_id: req.query.event_id || null,
      wp_user_id: req.query.wp_user_id ? Number(req.query.wp_user_id) : null,
      customer_email: req.query.customer_email || null,
      subscription_id: req.query.subscription_id || null,
      order_id: req.query.order_id || null,
      event_type: req.query.event_type || null,
      plan_slug: req.query.plan_slug || null,
      decision: req.query.decision || null,
      received_from: toMysqlDateTime(req.query.received_from),
      received_until: toMysqlDateTime(req.query.received_until),
    };
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscription-events.csv');
    await streamSubscriptionEventsCsv(res, { filters });
  });

  router.post('/api/logs/:channel/settings', requireAuth, (req, res) => {
    const { channel } = req.params;
    const settings = updateChannelSettings(channel, req.body || {});
    logAudit('admin.log.settings.updated', { channel, actor: 'admin' });
    sendJson(req, res, settings);
  });

  router.post('/api/logs/:channel/clear', requireAuth, (req, res) => {
    const { channel } = req.params;
    deleteChannelLogs(channel);
    logAudit('admin.log.cleared', { channel, actor: 'admin' });
    sendJson(req, res, { ok: true });
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
    sendJson(req, res, settings);
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
    sendJson(req, res, { ok: true });
  });

  router.get('/api/monitoring/metrics', requireAuth, (req, res) => {
    sendJson(req, res, getMetricsSnapshot());
  });

  router.get('/api/monitoring/range', requireAuth, (req, res) => {
    const from = parseInt(req.query.from, 10);
    const to = parseInt(req.query.to, 10);
    const bucketSec = parseInt(req.query.bucket_sec, 10);
    const series = getRangeSeries({ from, to, bucketSeconds: bucketSec });
    sendJson(req, res, series);
  });

  router.get('/api/monitoring/alerts/rules', requireAuth, async (req, res) => {
    sendJson(req, res, await listRules());
  });

  router.post('/api/monitoring/alerts/rules', requireAuth, async (req, res) => {
    const id = await upsertRule(req.body || {});
    logAudit('admin.monitoring.alert_rule.saved', { actor: 'admin', rule_id: id });
    sendJson(req, res, { ok: true, id });
  });

  router.post('/api/monitoring/alerts/rules/:id/delete', requireAuth, async (req, res) => {
    await deleteRule(req.params.id);
    logAudit('admin.monitoring.alert_rule.deleted', { actor: 'admin', rule_id: req.params.id });
    sendJson(req, res, { ok: true });
  });

  router.get('/api/monitoring/alerts/active', requireAuth, async (req, res) => {
    sendJson(req, res, await listActiveAlerts());
  });

  router.get('/api/monitoring/alerts/resolved', requireAuth, async (req, res) => {
    sendJson(req, res, await listResolvedAlerts());
  });

  router.post('/api/monitoring/alerts/:ruleId/ack', requireAuth, async (req, res) => {
    const duration = Number(req.body?.duration_sec) || 600;
    await ackAlert(req.params.ruleId, duration);
    logAudit('admin.monitoring.alert_rule.ack', { actor: 'admin', rule_id: req.params.ruleId, duration });
    sendJson(req, res, { ok: true });
  });

  router.post('/api/monitoring/alerts/:ruleId/silence', requireAuth, async (req, res) => {
    const duration = Number(req.body?.duration_sec) || 900;
    await silenceAlert(req.params.ruleId, duration);
    logAudit('admin.monitoring.alert_rule.silence', { actor: 'admin', rule_id: req.params.ruleId, duration });
    sendJson(req, res, { ok: true });
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
