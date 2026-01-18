const os = require('os');
const { getSettings, logInternal } = require('../logger');
const { maskValue, redactObject } = require('../logRedactor');

const EVENT_NAME = 'snapshot.debug';

function maskToken(value) {
  if (!value) return '';
  return maskValue(value);
}

function nowMs() {
  return Date.now();
}

function dur(startMs) {
  return Date.now() - startMs;
}

function isEnabled() {
  const settings = getSettings();
  const channel = settings.channels?.internal || {};
  if (!channel.enabled) return false;
  const level = channel.level || 'info';
  const levels = ['debug', 'info', 'warn', 'error'];
  return levels.indexOf(level) <= levels.indexOf('info');
}

function log(stage, data = {}, level = 'info') {
  if (!isEnabled()) return;
  const sanitizedData = redactObject(data || {});
  logInternal(EVENT_NAME, {
    stage,
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    loadavg: os.loadavg ? os.loadavg() : [],
    ...sanitizedData,
  }, level);
}

module.exports = {
  dur,
  isEnabled,
  log,
  maskToken,
  nowMs,
};
