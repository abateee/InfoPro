'use strict';

const PREFIX = '[InfoPro]';
const isDev = process.env.NODE_ENV !== 'production';

function log(level, ...args) {
  const timestamp = new Date().toISOString();
  console[level](`${PREFIX} ${timestamp}`, ...args);
}

const logger = {
  info(...args) {
    log('info', ...args);
  },
  warn(...args) {
    log('warn', ...args);
  },
  error(...args) {
    log('error', ...args);
    if (isDev && args[0] instanceof Error && args[0].stack) {
      console.error(args[0].stack);
    }
  }
};

module.exports = { logger };
