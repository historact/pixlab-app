const DEFAULT_GRACE_SECONDS = 120;

function getValidFromGraceSeconds() {
  const parsed = Number(process.env.VALID_FROM_GRACE_SECONDS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_GRACE_SECONDS;
}

function utcNow() {
  return new Date();
}

function immediateValidFromUTC(graceSeconds = getValidFromGraceSeconds()) {
  return new Date(Date.now() - graceSeconds * 1000);
}

function parseISO8601(input) {
  if (input === undefined || input === null) return { provided: false, date: null };
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { provided: false, date: null };

  const isoPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:?\d{2})$/;
  if (!isoPattern.test(raw)) {
    return { provided: true, error: 'invalid_date' };
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { provided: true, error: 'invalid_date' };
  }

  return { provided: true, date };
}

function normalizeManualValidFrom(inputDate, nowDate = utcNow(), graceSeconds = getValidFromGraceSeconds()) {
  if (!inputDate) return null;

  const nowMs = nowDate.getTime();
  const candidateMs = inputDate.getTime();
  if (candidateMs <= nowMs) return inputDate;

  const graceMs = graceSeconds * 1000;
  const timezoneClampMs = 2 * 60 * 60 * 1000; // 2 hours
  const delta = candidateMs - nowMs;

  if (delta <= graceMs || delta <= timezoneClampMs) {
    return immediateValidFromUTC(graceSeconds);
  }

  return inputDate;
}

function toMysqlUtcDatetime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}` +
    ` ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function parseMysqlUtcDatetime(input) {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const normalized = typeof input === 'string' ? `${input.replace(' ', 'T')}Z` : input;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
  DEFAULT_GRACE_SECONDS,
  getValidFromGraceSeconds,
  immediateValidFromUTC,
  normalizeManualValidFrom,
  parseISO8601,
  parseMysqlUtcDatetime,
  toMysqlUtcDatetime,
  utcNow,
};
