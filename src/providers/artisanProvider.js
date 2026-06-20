'use strict';

const cheerio = require('cheerio');
const {
  normalizeCompanyRecord,
  normalizeWebsiteStatus
} = require('../utils/searchModel');

const DEFAULT_BASE_URL = 'https://www.artisan-en-ligne.com';
const SOCIAL_HOSTS = [
  'facebook.',
  'instagram.',
  'linkedin.',
  'twitter.',
  'x.com',
  'youtube.',
  'pinterest.'
];
const MAX_ARTISAN_ENRICH_LIMIT = 500;

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeMatchText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulWords(value) {
  const ignored = new Set(['aux', 'avec', 'dans', 'des', 'du', 'en', 'et', 'la', 'le', 'les', 'pour', 'sur']);
  return normalizeMatchText(value)
    .split(' ')
    .filter((word) => word.length >= 4 && !ignored.has(word));
}

function resolveLimit(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, Math.min(Math.floor(number), max));
}

function parseSourceId(urlOrPath) {
  const value = String(urlOrPath || '');
  const match = value.match(/-(\d+)(?:[/?#]|$)/);
  return match ? match[1] : '';
}

function parseFrenchDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) {
    return '';
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function htmlLines(fragment) {
  return String(fragment || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map(normalizeText)
    .filter(Boolean);
}

function formatPhone(value) {
  const raw = normalizeText(value).replace(/<[^>]+>/g, '');
  const digits = raw.replace(/[^\d+]/g, '');
  const local = digits.startsWith('+33') ? `0${digits.slice(3)}` : digits;

  if (/^0\d{9}$/.test(local)) {
    return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }

  return raw;
}

class ArtisanProvider {
  constructor(options = {}) {
    this.name = 'artisan';
    this.baseUrl = String(options.baseUrl || process.env.ARTISAN_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = Number(options.timeoutMs ?? process.env.ARTISAN_TIMEOUT_MS ?? 20000);
    this.detailLimit = Number(options.detailLimit ?? process.env.ARTISAN_DETAIL_LIMIT ?? 10);
    this.phoneLimit = Number(options.phoneLimit ?? process.env.ARTISAN_PHONE_LIMIT ?? 10);
    this.phoneDelayMs = Number(options.phoneDelayMs ?? process.env.ARTISAN_PHONE_DELAY_MS ?? 750);
    this.maxContexts = Number(options.maxContexts ?? process.env.ARTISAN_MAX_CONTEXTS ?? 5);
    this.fetchImpl = options.fetchImpl || fetch;
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.optionsCache = null;
    this.optionsCacheAt = 0;
    this.optionsCacheTtlMs = Number(options.optionsCacheTtlMs || process.env.ARTISAN_OPTIONS_TTL_MS || 3600000);
    this.citiesCache = new Map();
  }

  absoluteUrl(href) {
    return new URL(String(href || ''), `${this.baseUrl}/`).href;
  }

  _isInternalUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '') === new URL(this.baseUrl).hostname.replace(/^www\./, '');
    } catch {
      return false;
    }
  }

  _isSocialUrl(url) {
    const lower = String(url || '').toLowerCase();
    return SOCIAL_HOSTS.some((host) => lower.includes(host));
  }

  async fetchText(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: options.method || 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 InfoPro ArtisanProvider',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(options.headers || {})
        },
        body: options.body,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Artisan provider error (${response.status}).`);
      }

      return response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  parseCheckOptions($, name) {
    const options = [];

    $(`input[name="${name}"]`).each((_, element) => {
      const input = $(element);
      const id = String(input.attr('id') || '').trim();
      const value = String(input.attr('value') || '').trim();
      const explicitLabel = id ? normalizeText($(`label[for="${id}"]`).first().text()) : '';
      const containerLabel = normalizeText(input.closest('li, label, p, div').text()).replace(value, '').trim();
      const label = explicitLabel || containerLabel;

      if (value && label) {
        options.push({
          id: value,
          label,
          selected: input.is(':checked')
        });
      }
    });

    return options;
  }

  parseMetadata(html) {
    const $ = cheerio.load(html || '');
    const departments = [];

    $('select[name="departement"] option').each((_, element) => {
      const option = $(element);
      const id = String(option.attr('value') || '').trim();
      const label = normalizeText(option.text());

      if (id && label) {
        const departmentCodeMatch = label.match(/^(\d{2,3})\s*-/);
        departments.push({
          id,
          code: departmentCodeMatch ? departmentCodeMatch[1] : id.padStart(2, '0'),
          label
        });
      }
    });

    return {
      departments,
      metiers: this.parseCheckOptions($, 'metier[]'),
      activities: this.parseCheckOptions($, 'activite[]')
    };
  }

  parseCitiesResponse(text) {
    return String(text || '')
      .split(';')
      .map((entry) => {
        const [id, label] = entry.split('|');
        return {
          id: String(id || '').trim(),
          label: normalizeText(label)
        };
      })
      .filter((entry) => entry.id && entry.label);
  }

  _buildContexts(filters) {
    const artisanDepartments = toList(filters.artisanDepartments);
    const departments = artisanDepartments.length ? artisanDepartments : toList(filters.departments);
    const cityIds = toList(filters.artisanCityIds);

    if (departments.length === 0 && cityIds.length === 0) {
      return [{}];
    }

    if (cityIds.length > 0) {
      const baseDepartments = departments.length ? departments : [''];
      const contexts = [];
      for (const department of baseDepartments) {
        for (const cityId of cityIds) {
          contexts.push({ department, cityId });
        }
      }
      return contexts;
    }

    return departments.map((department) => ({ department }));
  }

  buildSearchUrl(filters = {}, context = {}, page = 1) {
    const url = new URL('/annuaire', `${this.baseUrl}/`);
    const params = url.searchParams;
    const metierIds = toList(filters.artisanMetierIds);
    const activityIds = toList(filters.artisanActivityIds);

    if (context.department) {
      params.set('departement', String(context.department));
    }

    if (context.cityId) {
      params.set('ville', String(context.cityId));
    } else if (context.department) {
      params.set('ville', '');
    }

    for (const metierId of metierIds) {
      params.append('metier[]', metierId);
    }

    for (const activityId of activityIds) {
      params.append('activite[]', activityId);
    }

    if (metierIds.length === 0 && filters.query) {
      params.set('qactivite', String(filters.query).trim());
    }

    if (!context.department && !context.cityId && Array.isArray(filters.cities) && filters.cities[0]) {
      params.set('qlieu', String(filters.cities[0]).trim());
    }

    if (page > 1) {
      params.set('p', String(page));
    }

    return url.href;
  }

  parseListingPage(html, sourceUrl = '') {
    const $ = cheerio.load(html || '');
    const items = [];
    const seen = new Set();
    const countText = normalizeText($('body').text());
    const countMatch = countText.match(/(\d[\d\s]*)\s+artisans/i);
    const totalSeen = countMatch ? Number(countMatch[1].replace(/\s/g, '')) : null;
    const noResults = totalSeen === 0 || normalizeMatchText(countText).includes('aucun professionnel');

    if (noResults) {
      return {
        items,
        totalSeen: 0,
        hasNextPage: false
      };
    }

    const productionResults = $('#colonne-droite .relativeads h2 a[href*="/artisan-"], #colonne-droite .relativeads h3 a[href*="/artisan-"]');
    const resultLinks = productionResults.length > 0
      ? productionResults
      : $('h2 a[href*="/artisan-"], h3 a[href*="/artisan-"]').filter((_, anchor) => {
          return $(anchor).closest('.third').length === 0;
        });

    resultLinks.each((_, anchor) => {
      const link = $(anchor);
      const href = this.absoluteUrl(link.attr('href'));

      if (seen.has(href)) {
        return;
      }
      seen.add(href);

      const heading = link.closest('h2, h3');
      const container = heading.closest('article, li, div');
      const company = normalizeText(link.text() || heading.text());
      const rawText = htmlLines(container.html()).join(' ');
      const afterCompany = company && rawText.startsWith(company)
        ? normalizeText(rawText.slice(company.length))
        : rawText;
      const locationMatch = afterCompany.match(/^(.+?),\s+(.+?)\s+\((\d{2,3})\)/);
      const sourceId = parseSourceId(href);

      items.push(normalizeCompanyRecord({
        sourceId,
        company,
        city: locationMatch ? locationMatch[1] : '',
        department: locationMatch ? locationMatch[3] : '',
        address: '',
        websiteStatus: 'unknown',
        confidence: 'low',
        href,
        rawCells: [rawText],
        providerData: {
          listingUrl: sourceUrl,
          listingText: rawText
        },
        sources: [this.name]
      }, this.name));
    });

    const hasNextPage = $('a[href*="?p="], a[href*="&p="]')
      .toArray()
      .some((anchor) => /Page suivante|suivante/i.test(normalizeText($(anchor).text())));

    return {
      items,
      totalSeen,
      hasNextPage
    };
  }

  _extractAddress($, coord) {
    const paragraph = coord.find('p').first();
    const lines = htmlLines(paragraph.html());
    const company = normalizeText(paragraph.find('strong').first().text());
    const addressLines = lines.filter((line) => line !== company);
    const lastLine = addressLines[addressLines.length - 1] || '';
    const cityPostalMatch = lastLine.match(/^(.+?)\s+(\d{5})$/);
    const street = addressLines.slice(0, cityPostalMatch ? -1 : undefined).join(', ');

    return {
      company,
      address: street || addressLines.join(', '),
      city: cityPostalMatch ? normalizeText(cityPostalMatch[1]) : '',
      postalCode: cityPostalMatch ? cityPostalMatch[2] : ''
    };
  }

  _extractExternalLinks($, coord) {
    const socialLinks = [];
    let website = '';

    coord.find('a[href]').each((_, anchor) => {
      const href = this.absoluteUrl($(anchor).attr('href'));
      if (this._isInternalUrl(href)) {
        return;
      }

      if (this._isSocialUrl(href)) {
        socialLinks.push(href);
        return;
      }

      if (!website) {
        website = href;
      }
    });

    return {
      website,
      socialLinks: uniqueStrings(socialLinks)
    };
  }

  _extractSingleSegmentAnnuaireLinks($, activityLabel) {
    const activityLower = normalizeText(activityLabel).toLowerCase();
    const values = [];

    $('a[href*="/annuaire/"]').each((_, anchor) => {
      const link = $(anchor);
      const href = this.absoluteUrl(link.attr('href'));
      const url = new URL(href);
      const segments = url.pathname.split('/').filter(Boolean);
      const label = normalizeText(link.text());

      if (segments.length === 2 && segments[0] === 'annuaire' && label && label.toLowerCase() !== activityLower) {
        values.push(label);
      }
    });

    return uniqueStrings(values);
  }

  parseDetailPage(html, sourceUrl = '') {
    const $ = cheerio.load(html || '');
    const bodyText = normalizeText($('body').text());
    const h1 = normalizeText($('h1').first().text());
    const coord = $('#coordanchor');
    const address = this._extractAddress($, coord);
    const links = this._extractExternalLinks($, coord);
    const sourceId = parseSourceId(sourceUrl) || parseSourceId($('a[href*="/artisan-"]').first().attr('href'));
    const company = address.company || normalizeText(h1.split(':')[0]);
    const sirenMatch = bodyText.match(/\bSiren\s*:\s*(\d{9})/i);
    const siretMatch = bodyText.match(/\bSiret\s*:\s*(\d{14})/i);
    const apeMatch = bodyText.match(/\bCode APE\s*:\s*(\d{2}\.?\d{2}[A-Z])\b/i);
    const legalFormMatch = bodyText.match(/\bForme juridique\s*:\s*(.+?)\s*-\s*Code APE/i);
    const creationDateMatch = bodyText.match(/\bDate de création\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const activityMatch = bodyText.match(/Principales activités\s+(.+?)\s+Corps de métier/i);
    const cityFromH1 = h1.match(/\sà\s(.+?)\s+\((\d{2,3})\)/i);
    const phoneButtons = coord.find('a.appeler[data-for]').toArray().map((anchor) => {
      const link = $(anchor);
      return {
        contact: String(link.attr('data-for') || '').trim(),
        type: String(link.attr('data-type') || '').trim(),
        label: normalizeText(link.text())
      };
    }).filter((entry) => entry.contact);
    const emailRevealable = coord.find('a.email[data-for]').length > 0;
    const activityLabel = activityMatch ? normalizeText(activityMatch[1]) : '';
    const metiers = this._extractSingleSegmentAnnuaireLinks($, activityLabel);
    const websiteStatus = links.website ? 'has_website' : 'no_website';

    return normalizeCompanyRecord({
      sourceId,
      company,
      siren: sirenMatch ? sirenMatch[1] : '',
      siret: siretMatch ? siretMatch[1] : '',
      nafCode: apeMatch
        ? apeMatch[1].replace(/^(\d{2})(\d{2}[A-Z])$/, '$1.$2').toUpperCase()
        : '',
      city: address.city || (cityFromH1 ? cityFromH1[1] : ''),
      department: cityFromH1 ? cityFromH1[2] : (address.postalCode ? address.postalCode.slice(0, 2) : ''),
      postalCode: address.postalCode,
      address: address.address,
      legalForm: legalFormMatch ? normalizeText(legalFormMatch[1]) : '',
      website: links.website,
      websiteStatus,
      websiteStatusDetail: websiteStatus === 'has_website' ? 'artisan_external_website' : 'artisan_no_external_website',
      confidence: 'medium',
      validationSource: 'artisan',
      href: sourceUrl,
      creationDate: creationDateMatch ? parseFrenchDate(creationDateMatch[1]) : '',
      activityLabel,
      metiers,
      phoneStatus: phoneButtons.length > 0 ? 'revealable' : 'absent',
      phoneSource: '',
      providerData: {
        sourceId,
        socialLinks: links.socialLinks,
        emailRevealable,
        phoneButtons
      },
      sources: [this.name]
    }, this.name);
  }

  parsePhoneResponse(text) {
    const normalized = normalizeText(text).replace(/<[^>]+>/g, '');
    const match = normalized.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/);
    return match ? formatPhone(match[0]) : '';
  }

  async getOptions() {
    const now = Date.now();
    if (this.optionsCache && now - this.optionsCacheAt < this.optionsCacheTtlMs) {
      return this.optionsCache;
    }

    const html = await this.fetchText(`${this.baseUrl}/annuaire`);
    const options = this.parseMetadata(html);
    this.optionsCache = options;
    this.optionsCacheAt = now;
    return options;
  }

  async getCitiesForDepartment(department) {
    const value = String(department || '').trim();
    if (!value) {
      return [];
    }

    if (this.citiesCache.has(value)) {
      return this.citiesCache.get(value);
    }

    const body = new URLSearchParams({ currentdepartement: value }).toString();
    const text = await this.fetchText(`${this.baseUrl}/script/ajax/option-aire-urbaine.php`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        referer: `${this.baseUrl}/annuaire`
      },
      body
    });

    const cities = this.parseCitiesResponse(text);
    this.citiesCache.set(value, cities);
    return cities;
  }

  _shouldAutoPhone(filters) {
    return filters.artisanAutoPhone === true || filters.artisanAutoPhone === 'true' || filters.artisanAutoPhone === '1';
  }

  async _fetchPhone(button, clientId, referrer) {
    const body = new URLSearchParams({
      contact: button.contact,
      type: button.type || 'fixe',
      client: clientId || ''
    }).toString();
    const text = await this.fetchText(`${this.baseUrl}/script/ajax/appeler.php`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        referer: referrer
      },
      body
    });

    return this.parsePhoneResponse(text);
  }

  async _enrichDetails(items, filters, warnings) {
    const detailLimit = resolveLimit(filters.artisanDetailLimit, this.detailLimit, MAX_ARTISAN_ENRICH_LIMIT);
    const phoneLimit = resolveLimit(filters.artisanPhoneLimit, this.phoneLimit, MAX_ARTISAN_ENRICH_LIMIT);
    const autoPhone = this._shouldAutoPhone(filters);
    let detailCount = 0;
    let phoneAttempts = 0;
    let phoneFound = 0;
    const enriched = [];

    for (const item of items) {
      if (detailCount >= detailLimit || !item.href) {
        enriched.push(item);
        continue;
      }

      try {
        const html = await this.fetchText(item.href);
        let detail = this.parseDetailPage(html, item.href);
        detailCount += 1;

        const phoneButtons = detail.providerData && Array.isArray(detail.providerData.phoneButtons)
          ? detail.providerData.phoneButtons
          : [];

        if (autoPhone && phoneButtons.length > 0 && phoneAttempts < phoneLimit) {
          phoneAttempts += 1;
          try {
            const phone = await this._fetchPhone(phoneButtons[0], detail.sourceId || item.sourceId, item.href);
            if (phone) {
              phoneFound += 1;
              detail = normalizeCompanyRecord({
                ...detail,
                phone,
                phoneStatus: 'found',
                phoneSource: 'artisan_ajax'
              }, this.name);
            } else {
              detail = normalizeCompanyRecord({
                ...detail,
                phoneStatus: 'error',
                phoneSource: 'artisan_ajax'
              }, this.name);
            }
          } catch (error) {
            detail = normalizeCompanyRecord({
              ...detail,
              phoneStatus: 'error',
              phoneSource: 'artisan_ajax',
              warnings: [`[artisan] Telephone non recupere: ${error.message}`]
            }, this.name);
          }

          if (phoneAttempts < phoneLimit && this.phoneDelayMs > 0) {
            await this.sleep(this.phoneDelayMs);
          }
        }

        enriched.push(normalizeCompanyRecord({
          ...item,
          ...detail,
          providerData: {
            ...(item.providerData || {}),
            ...(detail.providerData || {})
          },
          sources: uniqueStrings([...(item.sources || []), ...(detail.sources || []), this.name])
        }, this.name));
      } catch (error) {
        warnings.push(`[artisan] Fiche non enrichie ${item.href}: ${error.message}`);
        enriched.push(item);
      }
    }

    return {
      items: enriched,
      detailCount,
      phoneAttempts,
      phoneFound
    };
  }

  _filterByWebsiteStatus(items, filters) {
    const status = normalizeWebsiteStatus(filters.websiteStatus);
    if (status === 'any') {
      return items;
    }

    return items.filter((item) => normalizeWebsiteStatus(item.websiteStatus) === status);
  }

  async _buildLocalFilterCriteria(filters) {
    const metierIds = new Set(toList(filters.artisanMetierIds));
    const activityIds = new Set(toList(filters.artisanActivityIds));
    const options = await this.getOptions();
    const metierLabels = (options.metiers || [])
      .filter((entry) => metierIds.has(String(entry.id)))
      .map((entry) => entry.label);
    const activityLabels = (options.activities || [])
      .filter((entry) => activityIds.has(String(entry.id)))
      .map((entry) => entry.label);

    return {
      metierLabels,
      activityLabels
    };
  }

  async _resolveContextCityLabel(context) {
    if (!context || !context.department || !context.cityId) {
      return '';
    }

    const cities = await this.getCitiesForDepartment(context.department);
    const match = cities.find((entry) => String(entry.id) === String(context.cityId));
    return match ? match.label : '';
  }

  _matchesLocalFilter(item, criteria, cityLabel = '') {
    const listingText = normalizeMatchText(
      item && item.providerData ? item.providerData.listingText : ''
    );
    const listingWords = new Set(listingText.split(' ').filter(Boolean));
    const metierLabels = criteria.metierLabels || [];
    const activityLabels = criteria.activityLabels || [];

    if (cityLabel && normalizeMatchText(item.city) !== normalizeMatchText(cityLabel)) {
      return false;
    }

    const matchesMetier = metierLabels.length === 0 || metierLabels.some((label) => {
      const normalizedLabel = normalizeMatchText(label);
      if (normalizedLabel && listingText.includes(normalizedLabel)) {
        return true;
      }

      return meaningfulWords(label).some((word) => listingWords.has(word));
    });

    const matchesActivity = activityLabels.length === 0 || activityLabels.some((label) => {
      const normalizedLabel = normalizeMatchText(label);
      return normalizedLabel && listingText.includes(normalizedLabel);
    });

    return matchesMetier && matchesActivity;
  }

  async search(filters = {}) {
    const contexts = this._buildContexts(filters);
    const warnings = [];
    const itemsByHref = new Map();
    const generatedUrls = [];
    let pagesRead = 0;
    let totalSeen = null;
    let fallbackUsed = false;
    let fallbackListingTotal = null;
    let localMatchedCount = null;
    let localFilterCriteria = null;
    const maxPages = Math.max(1, Math.min(Number(filters.maxPages || 3), 20));
    const hasLocalFilter = toList(filters.artisanMetierIds).length > 0 ||
      toList(filters.artisanActivityIds).length > 0;

    if (contexts.length > this.maxContexts) {
      warnings.push(`[artisan] Plusieurs contextes demandes: limitation a ${this.maxContexts}.`);
    }

    for (const context of contexts.slice(0, this.maxContexts)) {
      const useLocalCityFilter = !!context.cityId && hasLocalFilter;

      if (useLocalCityFilter) {
        if (!localFilterCriteria) {
          try {
            localFilterCriteria = await this._buildLocalFilterCriteria(filters);
          } catch (error) {
            warnings.push(`[artisan] Filtrage local indisponible: ${error.message}`);
            continue;
          }
        }

        const expectedMetiers = toList(filters.artisanMetierIds).length;
        const expectedActivities = toList(filters.artisanActivityIds).length;
        if (
          localFilterCriteria.metierLabels.length !== expectedMetiers ||
          localFilterCriteria.activityLabels.length !== expectedActivities
        ) {
          warnings.push('[artisan] Filtrage local ignore: libelles de filtres introuvables.');
          continue;
        }

        let cityLabel = '';
        try {
          cityLabel = await this._resolveContextCityLabel(context);
        } catch (error) {
          warnings.push(`[artisan] Ville exacte non resolue: ${error.message}`);
        }

        fallbackUsed = true;
        if (!warnings.some((entry) => entry.includes('filtrage local exhaustif'))) {
          warnings.push('[artisan] Recherche ville + metier/activite: filtrage local exhaustif applique.');
        }
        const localFilters = {
          ...filters,
          artisanMetierIds: [],
          artisanActivityIds: [],
          query: ''
        };
        let scannedCount = 0;
        let lastPageHasNext = false;

        for (let page = 1; page <= maxPages; page += 1) {
          const url = this.buildSearchUrl(localFilters, context, page);
          generatedUrls.push(url);

          let parsed;
          try {
            const html = await this.fetchText(url);
            parsed = this.parseListingPage(html, url);
          } catch (error) {
            warnings.push(`[artisan] Filtrage local: ${error.message}`);
            break;
          }

          pagesRead += 1;
          scannedCount += parsed.items.length;
          lastPageHasNext = parsed.hasNextPage;
          if (parsed.totalSeen != null) {
            fallbackListingTotal = parsed.totalSeen;
          }

          for (const item of parsed.items) {
            if (!this._matchesLocalFilter(item, localFilterCriteria, cityLabel)) {
              continue;
            }

            const key = item.href || item.sourceId;
            if (key && !itemsByHref.has(key)) {
              itemsByHref.set(key, item);
            }
          }

          if (!parsed.hasNextPage || parsed.items.length === 0) {
            break;
          }
        }

        if (
          lastPageHasNext &&
          fallbackListingTotal != null &&
          scannedCount < fallbackListingTotal
        ) {
          warnings.push(
            `[artisan] Resultats potentiellement tronques: ${scannedCount}/${fallbackListingTotal} fiches de la zone lues (maxPages=${maxPages}).`
          );
        }

        continue;
      }

      for (let page = 1; page <= maxPages; page += 1) {
        const url = this.buildSearchUrl(filters, context, page);
        generatedUrls.push(url);

        let parsed;
        try {
          const html = await this.fetchText(url);
          parsed = this.parseListingPage(html, url);
        } catch (error) {
          warnings.push(`[artisan] ${error.message}`);
          break;
        }

        pagesRead += 1;
        if (parsed.totalSeen != null) {
          totalSeen = parsed.totalSeen;
        }

        for (const item of parsed.items) {
          const key = item.href || item.sourceId;
          if (key && !itemsByHref.has(key)) {
            itemsByHref.set(key, item);
          }
        }

        if (!parsed.hasNextPage || parsed.items.length === 0) {
          break;
        }
      }
    }

    if (fallbackUsed) {
      localMatchedCount = itemsByHref.size;
      totalSeen = itemsByHref.size;
    }

    const detailResult = await this._enrichDetails(Array.from(itemsByHref.values()), filters, warnings);
    const filteredItems = this._filterByWebsiteStatus(detailResult.items, filters);

    return {
      items: filteredItems,
      warnings,
      meta: {
        provider: this.name,
        itemCount: filteredItems.length,
        listingItemCount: itemsByHref.size,
        pagesRead,
        totalSeen,
        generatedUrl: generatedUrls[0] || '',
        generatedUrls,
        fallbackUsed,
        fallbackListingTotal,
        localMatchedCount,
        detailCount: detailResult.detailCount,
        phoneAttempts: detailResult.phoneAttempts,
        phoneFound: detailResult.phoneFound
      }
    };
  }
}

module.exports = {
  ArtisanProvider,
  normalizeText,
  parseSourceId
};
