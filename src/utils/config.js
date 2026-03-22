'use strict';

const { logger } = require('./logger');

/**
 * Validates config for live mode. If INFONET_MODE=live and credentials are missing,
 * falls back to mock mode and logs a warning (avoids crashing on first /api/search).
 */
function validateInfonetConfig() {
  const mode = (process.env.INFONET_MODE || 'mock').toLowerCase();
  if (mode !== 'live') {
    return { mode: 'mock', valid: true };
  }

  const email = String(process.env.INFONET_EMAIL || '').trim();
  const password = String(process.env.INFONET_PASSWORD || '').trim();

  if (!email || !password) {
    logger.warn(
      'INFONET_MODE=live but INFONET_EMAIL or INFONET_PASSWORD is missing. Falling back to mock mode.'
    );
    process.env.INFONET_MODE = 'mock';
    return { mode: 'mock', valid: false, reason: 'missing_credentials' };
  }

  const baseUrl = String(process.env.INFONET_BASE_URL || 'https://infonet.fr').trim();
  if (!baseUrl.startsWith('http')) {
    logger.warn('INFONET_BASE_URL should be a valid URL. Using https://infonet.fr.');
  }

  return { mode: 'live', valid: true };
}

module.exports = { validateInfonetConfig };
