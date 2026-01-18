const os = require('os');
const { logInternal } = require('../logger');

const EVENT_NAME = 'snapshot.debug';

function maskToken(value) {
  if (!value) return '';
  const str = String(value);
  if (str.length <= 10) {
    return `${str.slice(0, 1)}***${str.slice(-1)}`;
  }
  return `${str.slice(0, 6)}***${str.slice(-4)}`;
}

function nowMs() {
  return Date.now();
}

function dur(startMs) {
  return Date.now() - startMs;
}

function isEnabled() {
  return String(process.env.SNAPSHOT_DEBUG || '1') !== '0';
}

function log(stage, data = {}, level = 'info') {
  if (!isEnabled()) return;
  logInternal(EVENT_NAME, {
    stage,
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    loadavg: os.loadavg ? os.loadavg() : [],
    ...data,
  }, level);
}

module.exports = {
  dur,
  isEnabled,
  log,
  maskToken,
  nowMs,
};
