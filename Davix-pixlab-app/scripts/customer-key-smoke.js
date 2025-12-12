#!/usr/bin/env node
const baseUrl = process.env.BASE_URL || 'http://localhost:3005';
const bridgeToken = process.env.SUBSCRIPTION_BRIDGE_TOKEN || process.env.X_DAVIX_BRIDGE_TOKEN;
const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'test@example.com';
const planSlug = process.env.TEST_PLAN_SLUG || 'dev-plan';

if (typeof fetch !== 'function') {
  console.error('Global fetch API is required for this script (Node.js 18+).');
  process.exit(1);
}

async function createCustomerKey() {
  const response = await fetch(`${baseUrl}/internal/subscription/event`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-davix-bridge-token': bridgeToken || '',
    },
    body: JSON.stringify({
      event: 'activated',
      customer_email: customerEmail,
      plan_slug: planSlug,
      status: 'active',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Subscription event failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (!payload.key) {
    throw new Error('No key returned from subscription event. Ensure a new key was created.');
  }

  return payload.key;
}

async function callToolsEndpoint(key) {
  const form = new FormData();
  const blob = new Blob([Buffer.from('hello world')], { type: 'text/plain' });
  form.append('images', blob, 'sample.txt');
  form.append('tools', 'hash');

  const response = await fetch(`${baseUrl}/v1/tools`, {
    method: 'POST',
    headers: {
      'x-api-key': key,
    },
    body: form,
  });

  const data = await response.json();
  return { status: response.status, data };
}

(async () => {
  try {
    if (!bridgeToken) {
      throw new Error('SUBSCRIPTION_BRIDGE_TOKEN is required to run this script.');
    }
    const key = await createCustomerKey();
    console.log('Created customer key:', key.slice(0, 8) + '...');
    const result = await callToolsEndpoint(key);
    console.log('Tools endpoint response:', result.status, JSON.stringify(result.data));
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();
