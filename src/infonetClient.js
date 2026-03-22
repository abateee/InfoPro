const { InfonetBrowserClient } = require('./infonetBrowserClient');
const { toList } = require('./utils/filters');
const { DEMO_COMPANIES } = require('./data/demoCompanies');
const {
  applyCompanyFilters,
  companyKey,
  normalizeCompanyRecord,
  normalizeWebsiteStatus,
  paginateItems
} = require('./utils/searchModel');

class InfonetClient {
  constructor() {
    this.mode = (process.env.INFONET_MODE || 'mock').toLowerCase();
    this.defaultNaf = toList(process.env.DEFAULT_NAF_CODES || '');
    this.defaultTags = toList(process.env.DEFAULT_TAGS || '');

    this.browserClient = null;
    if (this.mode === 'live') {
      this.browserClient = new InfonetBrowserClient({
        baseUrl: process.env.INFONET_BASE_URL || 'https://infonet.fr',
        email: process.env.INFONET_EMAIL,
        password: process.env.INFONET_PASSWORD,
        headless: String(process.env.INFONET_HEADLESS || '1') !== '0',
        defaultLimit: Number(process.env.DEFAULT_LIMIT || 25),
        defaultMaxPages: Number(process.env.INFONET_MAX_PAGES || 3),
        navTimeoutMs: Number(process.env.INFONET_NAV_TIMEOUT_MS || 45000),
        userAgent: process.env.INFONET_USER_AGENT
      });
    }
  }

  _resolveWebsiteStatus(filters) {
    if (filters && filters.hasWebsite) {
      return 'has_website';
    }
    return normalizeWebsiteStatus(filters && filters.websiteStatus);
  }

  _getMockRows() {
    return DEMO_COMPANIES.map((row) => normalizeCompanyRecord({
      ...row,
      href: `https://infonet.fr/entreprises/${row.siret || row.siren}`
    }, 'infonet'));
  }

  applyFilters(rows, filters) {
    return applyCompanyFilters(rows, {
      ...filters,
      websiteStatus: this._resolveWebsiteStatus(filters)
    });
  }

  async searchMock(filters) {
    const merged = {
      ...filters,
      nafCodes: (filters.nafCodes || []).length ? filters.nafCodes : this.defaultNaf,
      tags: (filters.tags || []).length ? filters.tags : this.defaultTags
    };

    const filtered = this.applyFilters(this._getMockRows(), merged);
    const paged = paginateItems(filtered, merged.page, merged.pageSize);

    return {
      mode: 'mock',
      generatedUrl: null,
      decodedQuery: null,
      warnings: [],
      ...paged
    };
  }

  _toLiveRecord(item, websiteStatus, confidence, filters) {
    const fallbackCity =
      (!item.city && Array.isArray(filters && filters.cities) && filters.cities.length === 1)
        ? String(filters.cities[0]).trim()
        : '';
    const fallbackDepartment =
      (!item.department && Array.isArray(filters && filters.departments) && filters.departments.length === 1)
        ? String(filters.departments[0]).trim()
        : '';

    return normalizeCompanyRecord({
      ...item,
      company: item.company || (Array.isArray(item.rawCells) ? String(item.rawCells[2] || '').trim() : ''),
      city: item.city || fallbackCity,
      department: item.department || fallbackDepartment,
      websiteStatus,
      confidence,
      sources: ['infonet']
    }, 'infonet');
  }

  async _runLiveSearch(filters, hasWebsite) {
    return this.browserClient.search({
      ...filters,
      hasWebsite: hasWebsite ? true : ''
    });
  }

  async _searchLiveHasWebsite(filters) {
    const live = await this._runLiveSearch(filters, true);
    const items = (live.items || []).map((item) => this._toLiveRecord(item, 'has_website', 'medium', filters));

    return {
      mode: 'live',
      items,
      pagination: {
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 25),
        total: items.length,
        totalPages: Math.max(1, Number(live.totalPagesSeen || 1))
      },
      generatedUrl: live.generatedUrl,
      hash: live.hash || null,
      decodedQuery: live.decodedQuery,
      warnings: [`Scraped pages: ${live.scrapedPages}/${live.totalPagesSeen}`]
    };
  }

  async _searchLiveNoWebsite(filters) {
    const baseline = await this._runLiveSearch(filters, false);
    const websiteSubset = await this._runLiveSearch(filters, true);
    const websiteKeys = new Set((websiteSubset.items || []).map((item) => companyKey(item)).filter(Boolean));

    let items = (baseline.items || [])
      .map((item) => {
        const key = companyKey(item);
        const hasWebsite = key && websiteKeys.has(key);
        return this._toLiveRecord(item, hasWebsite ? 'has_website' : 'no_website', hasWebsite ? 'medium' : 'low', filters);
      })
      .filter((item) => item.websiteStatus === 'no_website');

    const warnings = [
      `Scraped pages: ${baseline.scrapedPages}/${baseline.totalPagesSeen}`,
      '[infonet] "Sans site" est deduit en comparant la recherche complete et la recherche avec le filtre site web.'
    ];

    const enrichRequested = filters.includeContactEnrichment === true || filters.includeContactEnrichment === 'true';
    const enrichLimit = Number(process.env.INFONET_ENRICH_CONTACTS_LIMIT || 10);

    if (enrichRequested && items.length > 0 && enrichLimit > 0) {
      warnings.push(`[infonet] Enrichissement best-effort des contacts lance sur jusqu a ${Math.min(enrichLimit, items.length)} fiches.`);
      items = await this.browserClient.enrichCompanyContacts(items, enrichLimit);

      const beforeFilter = items.length;
      items = items.filter((item) => item.websiteStatus !== 'has_website');
      const upgradedToWebsite = beforeFilter - items.length;
      if (upgradedToWebsite > 0) {
        warnings.push(`[infonet] ${upgradedToWebsite} fiche(s) reclassifiee(s) avec site apres enrichissement.`);
      }
    }

    return {
      mode: 'live',
      items,
      pagination: {
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 25),
        total: items.length,
        totalPages: Math.max(1, Number(baseline.totalPagesSeen || 1))
      },
      generatedUrl: baseline.generatedUrl,
      hash: baseline.hash || null,
      decodedQuery: baseline.decodedQuery,
      warnings
    };
  }

  async _searchLiveUnknown(filters) {
    const live = await this._runLiveSearch(filters, false);
    const items = (live.items || []).map((item) => this._toLiveRecord(item, 'unknown', 'low', filters));

    return {
      mode: 'live',
      items,
      pagination: {
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 25),
        total: items.length,
        totalPages: Math.max(1, Number(live.totalPagesSeen || 1))
      },
      generatedUrl: live.generatedUrl,
      hash: live.hash || null,
      decodedQuery: live.decodedQuery,
      warnings: [`Scraped pages: ${live.scrapedPages}/${live.totalPagesSeen}`]
    };
  }

  async searchLive(filters) {
    if (!this.browserClient) {
      throw new Error('Live mode unavailable: browser client not initialized.');
    }

    const websiteStatus = this._resolveWebsiteStatus(filters);

    if (websiteStatus === 'has_website') {
      return this._searchLiveHasWebsite(filters);
    }

    if (websiteStatus === 'no_website') {
      return this._searchLiveNoWebsite(filters);
    }

    return this._searchLiveUnknown(filters);
  }

  async searchCompanies(filters) {
    if (this.mode === 'live') {
      return this.searchLive(filters);
    }

    return this.searchMock(filters || {});
  }

  async downloadCompanyDocuments({ href, company, siren }, downloadDir) {
    if (this.mode === 'live') {
      if (!this.browserClient) {
        throw new Error('Live mode unavailable: browser client not initialized.');
      }
      return this.browserClient.downloadCompanyDocuments(href, company, siren, downloadDir);
    }

    return {
      ok: true,
      folder: `downloads/${siren || company || 'mock'}`,
      count: 0,
      files: [],
      warning: 'Mock mode: no real download performed.'
    };
  }

  async dispose() {
    if (this.browserClient) {
      await this.browserClient.dispose();
    }
  }
}

function createInfonetClient() {
  return new InfonetClient();
}

module.exports = {
  createInfonetClient
};
