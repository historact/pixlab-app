const crypto = require('crypto');
const { pool } = require('../db');
const { parseMysqlUtcDatetime, toMysqlUtcDatetime } = require('./time');

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  return String(value);
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const parsed = parseMysqlUtcDatetime(value);
  return parsed ? parsed.toISOString() : '';
}

function buildFallbackEventId({
  normalizedEvent,
  subscriptionId,
  orderId,
  wpUserId,
  customerEmail,
  planKey,
  validFrom,
  validUntil,
  subscriptionStatus,
}) {
  const payload = [
    'pixlab',
    'v1',
    normalizeValue(normalizedEvent),
    normalizeValue(subscriptionId),
    normalizeValue(orderId),
    normalizeValue(wpUserId),
    normalizeValue(customerEmail),
    normalizeValue(planKey),
    normalizeDate(validFrom),
    normalizeDate(validUntil),
    normalizeValue(subscriptionStatus),
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function insertSubscriptionEvent({
  eventId,
  normalizedEvent,
  wpUserId,
  customerEmail,
  subscriptionId,
  orderId,
  planSlug,
  validFrom,
  validUntil,
  decision,
  apiKeyId,
  errorMessage,
  payloadJson,
}) {
  const [result] = await pool.execute(
    `INSERT INTO subscription_events (
        event_id, normalized_event, wp_user_id, customer_email, subscription_id, order_id,
        plan_slug, valid_from, valid_until, decision, api_key_id, error_message, payload_json, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [
      eventId,
      normalizedEvent || null,
      wpUserId || null,
      customerEmail || null,
      subscriptionId || null,
      orderId || null,
      planSlug || null,
      validFrom ? toMysqlUtcDatetime(validFrom) : null,
      validUntil ? toMysqlUtcDatetime(validUntil) : null,
      decision || null,
      apiKeyId || null,
      errorMessage || null,
      payloadJson,
    ]
  );
  return result?.insertId || null;
}

async function updateSubscriptionEventDecision({ eventId, decision, apiKeyId, errorMessage }) {
  await pool.execute(
    `UPDATE subscription_events
        SET decision = ?, api_key_id = ?, error_message = ?
      WHERE event_id = ?
      LIMIT 1`,
    [decision || null, apiKeyId || null, errorMessage || null, eventId]
  );
}

async function findSubscriptionEventById(eventId) {
  const [rows] = await pool.execute('SELECT * FROM subscription_events WHERE event_id = ? LIMIT 1', [eventId]);
  return rows[0] || null;
}

async function querySubscriptionEvents({ filters = {}, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];

  if (filters.event_id) {
    where.push('event_id = ?');
    params.push(filters.event_id);
  }
  if (filters.wp_user_id) {
    where.push('wp_user_id = ?');
    params.push(filters.wp_user_id);
  }
  if (filters.customer_email) {
    where.push('LOWER(customer_email) = ?');
    params.push(String(filters.customer_email).trim().toLowerCase());
  }
  if (filters.subscription_id) {
    where.push('subscription_id = ?');
    params.push(filters.subscription_id);
  }
  if (filters.order_id) {
    where.push('order_id = ?');
    params.push(filters.order_id);
  }
  if (filters.plan_slug) {
    where.push('plan_slug = ?');
    params.push(filters.plan_slug);
  }
  if (filters.event_type) {
    where.push('normalized_event = ?');
    params.push(filters.event_type);
  }
  if (filters.decision) {
    where.push('decision = ?');
    params.push(filters.decision);
  }
  if (filters.received_from) {
    where.push('received_at >= ?');
    params.push(filters.received_from);
  }
  if (filters.received_until) {
    where.push('received_at <= ?');
    params.push(filters.received_until);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM subscription_events ${whereSql}`,
    params
  );
  const [rows] = await pool.execute(
    `SELECT *
       FROM subscription_events
      ${whereSql}
      ORDER BY received_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { total: total || 0, rows };
}

async function streamSubscriptionEventsExport(res, { filters = {} } = {}) {
  const where = [];
  const params = [];

  if (filters.event_id) {
    where.push('event_id = ?');
    params.push(filters.event_id);
  }
  if (filters.wp_user_id) {
    where.push('wp_user_id = ?');
    params.push(filters.wp_user_id);
  }
  if (filters.customer_email) {
    where.push('LOWER(customer_email) = ?');
    params.push(String(filters.customer_email).trim().toLowerCase());
  }
  if (filters.subscription_id) {
    where.push('subscription_id = ?');
    params.push(filters.subscription_id);
  }
  if (filters.order_id) {
    where.push('order_id = ?');
    params.push(filters.order_id);
  }
  if (filters.plan_slug) {
    where.push('plan_slug = ?');
    params.push(filters.plan_slug);
  }
  if (filters.event_type) {
    where.push('normalized_event = ?');
    params.push(filters.event_type);
  }
  if (filters.decision) {
    where.push('decision = ?');
    params.push(filters.decision);
  }
  if (filters.received_from) {
    where.push('received_at >= ?');
    params.push(filters.received_from);
  }
  if (filters.received_until) {
    where.push('received_at <= ?');
    params.push(filters.received_until);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT *
       FROM subscription_events
      ${whereSql}
      ORDER BY received_at DESC, id DESC`,
    params
  );

  rows.forEach(row => {
    res.write(`${JSON.stringify(row)}\n`);
  });
  res.end();
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function streamSubscriptionEventsCsv(res, { filters = {} } = {}) {
  const where = [];
  const params = [];

  if (filters.event_id) {
    where.push('event_id = ?');
    params.push(filters.event_id);
  }
  if (filters.wp_user_id) {
    where.push('wp_user_id = ?');
    params.push(filters.wp_user_id);
  }
  if (filters.customer_email) {
    where.push('LOWER(customer_email) = ?');
    params.push(String(filters.customer_email).trim().toLowerCase());
  }
  if (filters.subscription_id) {
    where.push('subscription_id = ?');
    params.push(filters.subscription_id);
  }
  if (filters.order_id) {
    where.push('order_id = ?');
    params.push(filters.order_id);
  }
  if (filters.plan_slug) {
    where.push('plan_slug = ?');
    params.push(filters.plan_slug);
  }
  if (filters.event_type) {
    where.push('normalized_event = ?');
    params.push(filters.event_type);
  }
  if (filters.decision) {
    where.push('decision = ?');
    params.push(filters.decision);
  }
  if (filters.received_from) {
    where.push('received_at >= ?');
    params.push(filters.received_from);
  }
  if (filters.received_until) {
    where.push('received_at <= ?');
    params.push(filters.received_until);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT *
       FROM subscription_events
      ${whereSql}
      ORDER BY received_at DESC, id DESC`,
    params
  );

  const headers = [
    'id',
    'event_id',
    'received_at',
    'normalized_event',
    'wp_user_id',
    'customer_email',
    'subscription_id',
    'order_id',
    'plan_slug',
    'valid_from',
    'valid_until',
    'decision',
    'api_key_id',
    'error_message',
  ];
  res.write(`${headers.join(',')}\n`);
  rows.forEach(row => {
    const values = headers.map(key => csvEscape(row[key]));
    res.write(`${values.join(',')}\n`);
  });
  res.end();
}

async function cleanupSubscriptionEvents({ retentionDays, batchSize = 5000 }) {
  const safeDays = Number(retentionDays);
  const safeBatch = Number(batchSize);
  if (!Number.isFinite(safeDays) || safeDays <= 0 || !Number.isFinite(safeBatch) || safeBatch <= 0) {
    return { deleted: 0, skipped: true };
  }

  let deleted = 0;
  while (true) {
    const [result] = await pool.execute(
      `DELETE FROM subscription_events
        WHERE received_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)
        ORDER BY received_at
        LIMIT ?`,
      [safeDays, safeBatch]
    );
    const affected = result?.affectedRows || 0;
    deleted += affected;
    if (affected < safeBatch) break;
  }

  return { deleted, skipped: false };
}

module.exports = {
  buildFallbackEventId,
  insertSubscriptionEvent,
  updateSubscriptionEventDecision,
  findSubscriptionEventById,
  querySubscriptionEvents,
  streamSubscriptionEventsExport,
  streamSubscriptionEventsCsv,
  cleanupSubscriptionEvents,
};
