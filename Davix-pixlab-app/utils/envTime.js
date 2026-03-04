function readIntEnv(name, fallbackInt) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackInt;
  return parsed;
}

function toMsSeconds(seconds) {
  return seconds * 1000;
}

function toMsMinutes(minutes) {
  return minutes * 60 * 1000;
}

function toMsHours(hours) {
  return hours * 60 * 60 * 1000;
}

function readSecondsAsMs(nameS, fallbackSeconds) {
  return toMsSeconds(readIntEnv(nameS, fallbackSeconds));
}

function readMinutesAsMs(nameMin, fallbackMinutes) {
  return toMsMinutes(readIntEnv(nameMin, fallbackMinutes));
}

function readHoursAsMs(nameH, fallbackHours) {
  return toMsHours(readIntEnv(nameH, fallbackHours));
}

module.exports = {
  readIntEnv,
  toMsSeconds,
  toMsMinutes,
  toMsHours,
  readSecondsAsMs,
  readMinutesAsMs,
  readHoursAsMs,
};
