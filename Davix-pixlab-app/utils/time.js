const DEFAULT_GRACE_SECONDS = 120;

function utcNow() {
  return new Date();
}

function toMysqlDatetimeUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function parseDateInput(input) {
  if (input === undefined || input === null) return { provided: false, date: null };
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? { provided: true, error: 'invalid_date' } : { provided: true, date: input };
  }

  const trimmed = String(input).trim();
  if (!trimmed) return { provided: false, date: null };

  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [_, y, m, d] = dateOnly;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
    return { provided: true, date };
  }

  const dateTimeNoTz = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dateTimeNoTz) {
    const [_, y, m, d, hh, mm, ss] = dateTimeNoTz;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || 0)));
    return { provided: true, date };
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { provided: true, error: 'invalid_date' };
  }

  return { provided: true, date };
}

function applyGraceToValidFrom(validFromDate, now, graceSeconds) {
  const graceMs = Number.isFinite(graceSeconds) ? graceSeconds * 1000 : DEFAULT_GRACE_SECONDS * 1000;
  if (!validFromDate) {
    return new Date(now.getTime() - graceMs);
  }

  if (validFromDate.getTime() > now.getTime()) {
    if (validFromDate.getTime() - now.getTime() <= graceMs) {
      return new Date(now.getTime() - graceMs);
    }
    return validFromDate;
  }

  return validFromDate;
}

function getValidFromGraceSeconds() {
  const parsed = Number(process.env.VALID_FROM_GRACE_SECONDS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_GRACE_SECONDS;
}

module.exports = {
  applyGraceToValidFrom,
  getValidFromGraceSeconds,
  parseDateInput,
  toMysqlDatetimeUTC,
  utcNow,
};
