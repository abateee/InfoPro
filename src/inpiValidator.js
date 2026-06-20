'use strict';

const { InpiClient } = require('./inpiClient');
const { normalizeWebsiteStatus } = require('./utils/searchModel');

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

class InpiValidator {
  constructor(options = {}) {
    this.client = options.client || new InpiClient({
      baseUrl: process.env.INPI_BASE_URL,
      username: process.env.INPI_USERNAME,
      password: process.env.INPI_PASSWORD,
      timeoutMs: process.env.INPI_TIMEOUT_MS,
      tokenTtlMs: process.env.INPI_TOKEN_TTL_MS
    });
    this.maxChecks = Number(options.maxChecks || process.env.INPI_VALIDATE_LIMIT || 25);
  }

  get isConfigured() {
    return !!(this.client && this.client.isConfigured);
  }

  _filterByRequestedStatus(items, requestedStatus) {
    if (!requestedStatus || requestedStatus === 'any') {
      return items;
    }

    return (items || []).filter((item) => normalizeWebsiteStatus(item.websiteStatus) === requestedStatus);
  }

  async validateNoWebsiteCandidates(items, filters) {
    const requestedStatus = normalizeWebsiteStatus(filters.websiteStatus || (filters.hasWebsite ? 'has_website' : 'any'));
    const warnings = [];
    const nextItems = [];
    let checkedCount = 0;
    let reclassifiedCount = 0;
    let confirmedNoDomainCount = 0;
    let manualReviewCount = 0;

    const candidates = (items || []).filter((item) => normalizeWebsiteStatus(item.websiteStatus) === 'no_website');

    if (candidates.length === 0) {
      return {
        items: items || [],
        warnings,
        meta: null
      };
    }

    if (!this.isConfigured) {
      warnings.push('[inpi] Validation ignoree: identifiants INPI absents.');
      const unverifiedItems = (items || []).map((item) => {
        if (normalizeWebsiteStatus(item.websiteStatus) !== 'no_website') {
          return item;
        }

        return {
          ...item,
          websiteStatusDetail: item.websiteStatusDetail || 'no_website_unverified',
          inpiValidationStatus: 'not_configured',
          shouldPersistNoWebsite: false
        };
      });
      return {
        items: this._filterByRequestedStatus(unverifiedItems, requestedStatus),
        warnings,
        meta: {
          provider: 'inpi',
          validationEnabled: false,
          checkedCount: 0,
          reclassifiedCount: 0,
          confirmedNoDomainCount: 0,
          manualReviewCount: candidates.length
        }
      };
    }

    const safeMaxChecks = Math.max(0, this.maxChecks);

    for (const item of items || []) {
      if (normalizeWebsiteStatus(item.websiteStatus) !== 'no_website') {
        nextItems.push(item);
        continue;
      }

      if (!item.siren || checkedCount >= safeMaxChecks) {
        manualReviewCount += 1;
        nextItems.push({
          ...item,
          websiteStatus: 'unknown',
          websiteStatusDetail: 'needs_manual_review',
          validationSource: 'inpi',
          inpiValidationStatus: item.siren ? 'not_checked_limit' : 'missing_siren',
          inpiDomains: [],
          shouldPersistNoWebsite: false
        });
        continue;
      }

      checkedCount += 1;
      const validation = await this.client.validateCompanyWebsite(item.siren);

      if (validation.status === 'confirmed_domain') {
        reclassifiedCount += 1;
        nextItems.push({
          ...item,
          website: item.website || validation.website,
          websiteStatus: 'has_website',
          websiteStatusDetail: 'has_website_inpi',
          confidence: 'official',
          validationSource: 'inpi',
          inpiValidationStatus: 'confirmed_domain',
          inpiDomains: validation.domains,
          sources: uniqueStrings([...(item.sources || []), 'inpi']),
          shouldPersistNoWebsite: false
        });
        continue;
      }

      if (validation.status === 'no_domain_found') {
        confirmedNoDomainCount += 1;
        nextItems.push({
          ...item,
          websiteStatus: 'no_website',
          websiteStatusDetail: 'no_website_inpi_checked',
          validationSource: 'inpi',
          inpiValidationStatus: 'no_domain_found',
          inpiDomains: [],
          sources: uniqueStrings([...(item.sources || []), 'inpi']),
          shouldPersistNoWebsite: true
        });
        continue;
      }

      manualReviewCount += 1;
      nextItems.push({
        ...item,
        websiteStatus: 'unknown',
        websiteStatusDetail: 'needs_manual_review',
        validationSource: 'inpi',
        inpiValidationStatus: validation.status || 'error',
        inpiDomains: [],
        sources: uniqueStrings([...(item.sources || []), 'inpi']),
        shouldPersistNoWebsite: false
      });

      if (validation.error) {
        warnings.push(`[inpi] ${item.siren}: ${validation.error}`);
      }
    }

    if (checkedCount > 0) {
      warnings.push(`[inpi] ${checkedCount} fiche(s) verifiee(s), ${reclassifiedCount} reclassifiee(s) avec domaine, ${confirmedNoDomainCount} confirmee(s) sans domaine declare.`);
    }

    return {
      items: this._filterByRequestedStatus(nextItems, requestedStatus),
      warnings,
      meta: {
        provider: 'inpi',
        validationEnabled: true,
        checkedCount,
        reclassifiedCount,
        confirmedNoDomainCount,
        manualReviewCount
      }
    };
  }
}

module.exports = {
  InpiValidator
};
