'use strict';

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeDomain(value) {
  const text = normalizeString(value).toLowerCase();
  if (!text) {
    return '';
  }

  try {
    const url = text.startsWith('http://') || text.startsWith('https://')
      ? new URL(text)
      : new URL(`https://${text}`);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/$/, '');
  } catch {
    return text
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .replace(/\s+/g, '');
  }
}

function toWebsiteUrl(domain) {
  const normalized = normalizeDomain(domain);
  return normalized ? `https://${normalized}` : '';
}

function collectDeclaredDomains(node, domains = []) {
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectDeclaredDomains(entry, domains);
    }
    return domains;
  }

  if (!node || typeof node !== 'object') {
    return domains;
  }

  for (const [key, value] of Object.entries(node)) {
    if (/^nomDomaine$/i.test(key) && typeof value === 'string') {
      const domain = normalizeDomain(value);
      if (domain) {
        domains.push(domain);
      }
      continue;
    }

    collectDeclaredDomains(value, domains);
  }

  return domains;
}

class InpiClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || 'https://registre-national-entreprises.inpi.fr').replace(/\/$/, '');
    this.username = normalizeString(options.username);
    this.password = normalizeString(options.password);
    this.timeoutMs = Number(options.timeoutMs || 20000);
    this.tokenTtlMs = Number(options.tokenTtlMs || 45 * 60 * 1000);
    this.cache = new Map();
    this.token = '';
    this.tokenExpiresAt = 0;
  }

  get isConfigured() {
    return !!(this.username && this.password);
  }

  async _fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.headers || {})
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const error = new Error(`INPI error (${response.status}).`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _login(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.token && now < this.tokenExpiresAt) {
      return this.token;
    }

    if (!this.isConfigured) {
      throw new Error('Missing INPI credentials.');
    }

    const payload = await this._fetchJson(`${this.baseUrl}/api/sso/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password
      })
    });

    this.token = normalizeString(payload.token);
    this.tokenExpiresAt = now + this.tokenTtlMs;

    if (!this.token) {
      throw new Error('INPI login did not return a token.');
    }

    return this.token;
  }

  async _getCompanyRaw(siren, retry = true) {
    const token = await this._login(false);

    try {
      return await this._fetchJson(`${this.baseUrl}/api/companies/${encodeURIComponent(siren)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      if (retry && error && error.status === 401) {
        await this._login(true);
        return this._getCompanyRaw(siren, false);
      }

      if (error && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async validateCompanyWebsite(siren) {
    const normalizedSiren = normalizeString(siren);

    if (!normalizedSiren) {
      return {
        checked: false,
        status: 'missing_siren',
        domains: [],
        website: ''
      };
    }

    if (!this.isConfigured) {
      return {
        checked: false,
        status: 'not_configured',
        domains: [],
        website: ''
      };
    }

    if (this.cache.has(normalizedSiren)) {
      return this.cache.get(normalizedSiren);
    }

    try {
      const raw = await this._getCompanyRaw(normalizedSiren);
      if (!raw) {
        const notFound = {
          checked: true,
          status: 'not_found',
          domains: [],
          website: ''
        };
        this.cache.set(normalizedSiren, notFound);
        return notFound;
      }

      const domains = Array.from(new Set(collectDeclaredDomains(raw)));
      const result = {
        checked: true,
        status: domains.length > 0 ? 'confirmed_domain' : 'no_domain_found',
        domains,
        website: domains.length > 0 ? toWebsiteUrl(domains[0]) : ''
      };

      this.cache.set(normalizedSiren, result);
      return result;
    } catch (error) {
      return {
        checked: false,
        status: 'error',
        domains: [],
        website: '',
        error: error.message || 'INPI validation error'
      };
    }
  }
}

module.exports = {
  InpiClient,
  collectDeclaredDomains,
  normalizeDomain,
  toWebsiteUrl
};
