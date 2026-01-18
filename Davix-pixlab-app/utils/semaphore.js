function createSemaphore(maxConcurrency) {
  const max = Number.isFinite(Number(maxConcurrency)) && Number(maxConcurrency) > 0 ? Number(maxConcurrency) : 1;
  let current = 0;
  const queue = [];

  function release() {
    if (queue.length > 0) {
      const next = queue.shift();
      if (next.timer) clearTimeout(next.timer);
      return next.resolve(release);
    }
    current = Math.max(0, current - 1);
  }

  function acquire({ timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      if (current < max) {
        current += 1;
        return resolve(release);
      }

      const entry = { resolve, reject, timer: null };
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          const index = queue.indexOf(entry);
          if (index >= 0) queue.splice(index, 1);
          reject(new Error('semaphore_timeout'));
        }, timeoutMs);
      }
      queue.push(entry);
    });
  }

  function getStats() {
    return { active: current, queued: queue.length, max };
  }

  return { acquire, getStats };
}

module.exports = { createSemaphore };
