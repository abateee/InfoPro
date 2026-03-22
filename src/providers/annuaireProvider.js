'use strict';

const {
  normalizeCompanyRecord,
  normalizeWebsiteStatus
} = require('../utils/searchModel');

class AnnuaireProvider {
  constructor(options = {}) {
    this.name = 'annuaire';
    this.baseUrl = String(options.baseUrl || 'https://recherche-entreprises.api.gouv.fr').replace(/\/$/, '');
    this.timeoutMs = Number(options.timeoutMs || 20000);
  }

  _buildSearchContexts(filters) {
    const postalCodes = (filters.postalCodes || []).filter(Boolean);
    const cities = (filters.cities || []).filter(Boolean);
    const departments = (filters.departments || []).filter(Boolean);

    if (postalCodes.length > 0) {
      return postalCodes.map((postalCode) => ({ postalCode }));
    }

    if (cities.length > 0) {
      return cities.map((city) => ({ city }));
    }

    if (departments.length > 0) {
      return departments.map((department) => ({ department }));
    }

    return [{}];
  }

  _buildQuery(filters, context) {
    const terms = [];

    if (filters.query) {
      terms.push(String(filters.query).trim());
    }

    if (context.city) {
      terms.push(String(context.city).trim());
    }

    if (context.department) {
      terms.push(String(context.department).trim());
    }

    return terms.join(' ').trim();
  }

  _mapResult(entry) {
    const siege = entry.siege || {};
    const postalCode = String(
      siege.code_postal ||
      entry.code_postal ||
      entry.codePostal ||
      ''
    ).trim();

    const siret = String(
      siege.siret ||
      entry.siret_siege ||
      entry.siret ||
      ''
    ).trim();

    const siren = String(entry.siren || '').trim();
    const company = String(
      entry.nom_complet ||
      entry.nom_raison_sociale ||
      entry.denomination ||
      entry.nom ||
      ''
    ).trim();

    return normalizeCompanyRecord({
      company,
      siren,
      siret,
      nafCode: entry.activite_principale || entry.code_naf || '',
      city: siege.libelle_commune || entry.ville || entry.commune || '',
      department: entry.departement || postalCode.slice(0, 2),
      postalCode,
      address: siege.adresse_complete || entry.adresse_complete || entry.adresse_postale || '',
      legalForm: entry.forme_juridique || entry.nature_juridique || '',
      status: entry.etat_administratif || '',
      website: '',
      websiteStatus: 'unknown',
      confidence: 'official',
      href: siret
        ? `https://annuaire-entreprises.data.gouv.fr/etablissement/${siret}`
        : (siren ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}` : ''),
      sources: ['annuaire']
    }, this.name);
  }

  async _fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Annuaire provider error (${response.status}).`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async search(filters) {
    if (normalizeWebsiteStatus(filters.websiteStatus) === 'no_website') {
      return {
        items: [],
        warnings: ['[annuaire] Le provider ne sait pas confirmer "sans site". Statut laisse a inconnu.'],
        meta: {
          provider: this.name,
          itemCount: 0
        }
      };
    }

    const perPage = Math.max(1, Math.min(Number(filters.pageSize || 25), 25));
    const maxPages = Math.max(1, Math.min(Number(filters.maxPages || 2), 5));
    const contexts = this._buildSearchContexts(filters);
    const warnings = [];
    const items = [];

    if (contexts.length > 3) {
      warnings.push('[annuaire] Plusieurs localisations demandees: limitation a 3 contextes pour cette passe.');
    }

    for (const context of contexts.slice(0, 3)) {
      const params = new URLSearchParams();
      const query = this._buildQuery(filters, context);

      params.set('q', query);
      params.set('per_page', String(perPage));
      params.set('include', 'siege');
      params.set('minimal', 'true');

      if (filters.isActive) {
        params.set('etat_administratif', 'A');
      }

      const activityCode = (filters.apeCodes || filters.nafCodes || []).find(Boolean);
      if (activityCode) {
        params.set('activite_principale', String(activityCode));
      }

      if (context.postalCode) {
        params.set('code_postal', String(context.postalCode));
      }

      for (let page = 1; page <= maxPages; page += 1) {
        params.set('page', String(page));

        let payload;
        try {
          payload = await this._fetchJson(`${this.baseUrl}/search?${params.toString()}`);
        } catch (error) {
          warnings.push(`[annuaire] ${error.message}`);
          break;
        }

        const pageResults = Array.isArray(payload.results) ? payload.results : [];
        items.push(...pageResults.map((entry) => this._mapResult(entry)));

        if (pageResults.length < perPage) {
          break;
        }
      }
    }

    return {
      items,
      warnings,
      meta: {
        provider: this.name,
        itemCount: items.length
      }
    };
  }
}

module.exports = {
  AnnuaireProvider
};
