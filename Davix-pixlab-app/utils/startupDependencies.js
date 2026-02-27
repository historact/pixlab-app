const { execFile } = require('child_process');
const { isProduction } = require('./config');

function commandExists(command, args = ['--version']) {
  return new Promise(resolve => {
    execFile(command, args, error => {
      resolve(!error);
    });
  });
}

async function checkStartupDependencies({ logger = console, logRuntime } = {}) {
  const checks = [
    {
      name: 'qpdf',
      args: ['--version'],
      installHint: 'Install on Debian/Ubuntu: sudo apt-get install qpdf',
    },
    {
      name: 'pdftoppm',
      args: ['-v'],
      installHint: 'Install on Debian/Ubuntu: sudo apt-get install poppler-utils',
    },
  ];

  const missing = [];
  for (const check of checks) {
    const exists = await commandExists(check.name, check.args);
    if (!exists) {
      missing.push(check);
    }
  }

  if (!missing.length) return;

  const message = [
    'Required PDF system dependencies are missing:',
    ...missing.map(dep => `- Missing dependency: ${dep.name}. ${dep.installHint}`),
  ].join('\n');

  if (typeof logRuntime === 'function') {
    logRuntime('startup.dependencies.missing', {
      dependencies: missing.map(dep => dep.name),
    }, isProduction() ? 'error' : 'warn');
  }

  if (isProduction()) {
    throw new Error(message);
  }

  logger.warn(`[CONFIG][WARN] ${message}`);
}

module.exports = {
  checkStartupDependencies,
};
