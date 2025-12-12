#!/usr/bin/env node
const baseUrl = process.env.BASE_URL || 'http://localhost:3005';
const bridgeToken = process.env.SUBSCRIPTION_BRIDGE_TOKEN || process.env.X_DAVIX_BRIDGE_TOKEN;
const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'test@example.com';
const subscriptionId = process.env.TEST_SUBSCRIPTION_ID || null;

if (typeof fetch !== 'function') {
  console.error('Global fetch API is required for this script (Node.js 18+).');
  process.exit(1);
}

async function runSummary() {
  const payload = {
    customer_email: customerEmail,
  };

  if (subscriptionId) {
    payload.subscription_id = subscriptionId;
  }

  const response = await fetch(`${baseUrl}/internal/user/summary`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-davix-bridge-token': bridgeToken || '',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Unexpected response: ${text}`);
  }

  if (!response.ok) {
    throw new Error(`Summary request failed (${response.status}): ${text}`);
  }

  return json;
}

(async () => {
  try {
    if (!bridgeToken) {
      throw new Error('SUBSCRIPTION_BRIDGE_TOKEN is required to run this script.');
    }
    const summary = await runSummary();
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();
