'use strict';

const { createInfonetClient } = require('./infonetClient');
const { InpiValidator } = require('./inpiValidator');
const { AnnuaireProvider } = require('./providers/annuaireProvider');
const {
  mergeCompanyRecords,
  paginateItems
} = require('./utils/searchModel');

class SearchEngine {
  constructor(options = {}) {
    this.infonetClient = options.infonetClient || createInfonetClient();
    this.annuaireProvider = options.annuaireProvider || new AnnuaireProvider({
      baseUrl: process.env.ANNUAIRE_BASE_URL,
      timeoutMs: process.env.ANNUAIRE_TIMEOUT_MS
    });
    this.inpiValidator = options.inpiValidator || new InpiValidator();
    this.defaultProviders = this._parseProviders(
      options.defaultProviders || process.env.SEARCH_PROVIDERS || 'infonet'
    );
  }

  _parseProviders(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)));
    }

    return Array.from(
      new Set(
        String(value || '')
          .split(',')
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }

  _resolveProviders(filters) {
    const requested = this._parseProviders(filters.providers || []);
    const names = requested.length > 0 ? requested : this.defaultProviders;
    return names.filter((name) => name === 'infonet' || name === 'annuaire');
  }

  async _searchInfonet(filters) {
    const result = await this.infonetClient.searchCompanies(filters);
    return {
      items: result.items || [],
      warnings: result.warnings || [],
      meta: {
        provider: 'infonet',
        mode: result.mode,
        generatedUrl: result.generatedUrl || '',
        decodedQuery: result.decodedQuery || '',
        itemCount: (result.items || []).length
      }
    };
  }

  async _searchAnnuaire(filters) {
    return this.annuaireProvider.search(filters);
  }

  async searchCompanies(filters) {
    const providerNames = this._resolveProviders(filters);
    const providerResults = [];
    const warnings = [];
    const mergedItems = [];

    const providerFilters = {
      ...filters,
      page: 1,
      pageSize: Math.min(100, Math.max(25, Number(filters.pageSize || 25)))
    };

    for (const providerName of providerNames) {
      try {
        const providerResult =
          providerName === 'annuaire'
            ? await this._searchAnnuaire(providerFilters)
            : await this._searchInfonet(providerFilters);

        providerResults.push(providerResult.meta || { provider: providerName });
        warnings.push(...(providerResult.warnings || []));
        mergedItems.push(...(providerResult.items || []));
      } catch (error) {
        warnings.push(`[${providerName}] ${error.message || 'Provider error.'}`);
      }
    }

    const merged = mergeCompanyRecords(mergedItems);
    const validationResult = this.inpiValidator
      ? await this.inpiValidator.validateNoWebsiteCandidates(merged, filters)
      : { items: merged, warnings: [], meta: null };
    const finalItems = validationResult.items || merged;

    warnings.push(...(validationResult.warnings || []));
    if (validationResult.meta) {
      providerResults.push(validationResult.meta);
    }

    const paged = paginateItems(finalItems, Number(filters.page || 1), Number(filters.pageSize || 25));

    return {
      mode: providerNames.join('+') || 'none',
      providers: providerNames,
      providerResults,
      warnings,
      ...paged
    };
  }

  async dispose() {
    if (this.infonetClient && typeof this.infonetClient.dispose === 'function') {
      await this.infonetClient.dispose();
    }
  }
}

function createSearchEngine(options) {
  return new SearchEngine(options);
}

module.exports = {
  SearchEngine,
  createSearchEngine
};
