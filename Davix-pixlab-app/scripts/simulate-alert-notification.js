const { randomUUID } = require('crypto');
const { sendAlert } = require('../utils/alerts');
const { updateAlertSettings } = require('../utils/logger');
const { buildSnapshotUrl } = require('../utils/monitoringSnapshot');

function parseList(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

async function main() {
  const ruleId = process.argv[2] || 'manual';
  const requestId = randomUUID();
  const firedAt = new Date().toISOString();
  const alertId = `sim-${Date.now()}`;
  const snapshotViewUrl = buildSnapshotUrl(ruleId, { view: true });
  const snapshotImageUrl = buildSnapshotUrl(ruleId, { view: false });

  if (!process.env.PUBLIC_BASE_URL) {
    console.warn('[simulate] PUBLIC_BASE_URL is not set; snapshot links may not be publicly reachable.');
  }
  if (!process.env.SUBSCRIPTION_BRIDGE_TOKEN) {
    console.warn('[simulate] SUBSCRIPTION_BRIDGE_TOKEN is not set; snapshot fetch may fail.');
  }

  const emailRecipients = parseList(process.env.SIMULATE_ALERT_EMAIL_RECIPIENTS);
  const telegramTargets = parseList(process.env.SIMULATE_ALERT_TELEGRAM_TARGETS);
  if (emailRecipients.length || telegramTargets.length) {
    updateAlertSettings({
      email: { enabled: emailRecipients.length > 0, recipients: emailRecipients },
      telegram: { enabled: telegramTargets.length > 0, targets: telegramTargets },
    });
  }

  const result = await sendAlert(
    {
      channel: 'runtime',
      level: 'warn',
      event: 'monitoring.alert.simulate',
      message: 'Simulated alert notification pipeline',
      rule_name: 'Simulated rule',
      rule_id: ruleId,
      alert_id: alertId,
      fired_at: firedAt,
      request_id: requestId,
      snapshot_url: snapshotViewUrl,
      snapshot_view_url: snapshotViewUrl,
      snapshot_image_url: snapshotImageUrl,
    },
    { force: true }
  );

  if (!result.ok) {
    console.error('[simulate] Alert send failed', result);
    process.exit(1);
  }
  console.log('[simulate] Alert send OK');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
