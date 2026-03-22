'use strict';

const WEBSITE_STATUS_VALUES = ['any', 'has_website', 'no_website', 'unknown'];
const CONFIDENCE_RANK = {
  low: 1,
  medium: 2,
  high: 3,
  official: 4
};
const COMPANY_STOP_WORDS = new Set([
  'sa',
  'sas',
  'sasu',
  'sarl',
  'eurl',
  'sci',
  'scop',
  'scm',
  'holding',
  'groupe',
  'group',
  'societe',
  'company',
  'cie'
]);

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeStringLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeWebsiteStatus(value) {
  const raw = normalizeStringLower(value);
  if (!raw || raw === 'any' || raw === 'all') {
    return 'any';
  }

  if (raw === 'has_website' || raw === 'website' || raw === 'with_website') {
    return 'has_website';
  }

  if (raw === 'no_website' || raw === 'without_website' || raw === 'sans_site') {
    return 'no_website';
  }

  if (raw === 'unknown' || raw === 'incertain') {
    return 'unknown';
  }

  return 'any';
}

function normalizeConfidence(value) {
  const raw = normalizeStringLower(value);
  if (raw === 'official' || raw === 'high' || raw === 'medium' || raw === 'low') {
    return raw;
  }
  return 'low';
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => normalizeString(value)).filter(Boolean)));
}

function normalizeOptionalBoolean(value) {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  return undefined;
}

function canonicalCompanyName(value) {
  const raw = normalizeStringLower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !COMPANY_STOP_WORDS.has(token));

  return raw.join(' ');
}

function companyKey(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }

  const canonicalName = canonicalCompanyName(item.company || item.name);
  const postalCode = normalizeString(item.postalCode);
  const city = normalizeStringLower(item.city);

  return (
    normalizeString(item.siret) ||
    normalizeString(item.siren) ||
    normalizeString(item.href) ||
    (canonicalName && postalCode ? `${canonicalName}|${postalCode}` : '') ||
    (canonicalName && city ? `${canonicalName}|${city}` : '')
  );
}

function inferWebsiteStatus(item) {
  if (normalizeString(item.website)) {
    return 'has_website';
  }

  const normalized = normalizeWebsiteStatus(item.websiteStatus);
  return normalized === 'any' ? 'unknown' : normalized;
}

function normalizeCompanyRecord(item, providerName) {
  const company = normalizeString(item.company || item.name);
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag) => normalizeString(tag)).filter(Boolean)
    : [];
  const sources = uniqueStrings([...(item.sources || []), providerName]);

  return {
    id: normalizeString(item.id),
    company,
    name: company,
    siren: normalizeString(item.siren),
    siret: normalizeString(item.siret),
    nafCode: normalizeString(item.nafCode || item.apeCode),
    tags,
    city: normalizeString(item.city),
    department: normalizeString(item.department),
    postalCode: normalizeString(item.postalCode),
    address: normalizeString(item.address),
    legalForm: normalizeString(item.legalForm),
    status: normalizeString(item.status),
    phone: normalizeString(item.phone),
    email: normalizeString(item.email),
    website: normalizeString(item.website),
    websiteStatus: inferWebsiteStatus(item),
    websiteStatusDetail: normalizeString(item.websiteStatusDetail),
    confidence: normalizeConfidence(item.confidence),
    validationSource: normalizeString(item.validationSource),
    inpiValidationStatus: normalizeString(item.inpiValidationStatus),
    inpiDomains: uniqueStrings(item.inpiDomains || []),
    shouldPersistNoWebsite: normalizeOptionalBoolean(item.shouldPersistNoWebsite),
    href: normalizeString(item.href),
    rawCells: Array.isArray(item.rawCells) ? item.rawCells.slice() : [],
    warnings: Array.isArray(item.warnings) ? uniqueStrings(item.warnings) : [],
    sources
  };
}

function mergeCompanyRecords(items) {
  const merged = new Map();

  for (const item of items || []) {
    const key = companyKey(item);
    if (!key) {
      continue;
    }

    const normalized = normalizeCompanyRecord(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, normalized);
      continue;
    }

    const confidenceWins =
      CONFIDENCE_RANK[normalized.confidence] > CONFIDENCE_RANK[existing.confidence];

    const next = {
      ...existing,
      company: existing.company || normalized.company,
      name: existing.name || normalized.name,
      siren: existing.siren || normalized.siren,
      siret: existing.siret || normalized.siret,
      nafCode: existing.nafCode || normalized.nafCode,
      city: existing.city || normalized.city,
      department: existing.department || normalized.department,
      postalCode: existing.postalCode || normalized.postalCode,
      address: existing.address || normalized.address,
      legalForm: existing.legalForm || normalized.legalForm,
      status: existing.status || normalized.status,
      phone: existing.phone || normalized.phone,
      email: existing.email || normalized.email,
      website: existing.website || normalized.website,
      websiteStatusDetail: existing.websiteStatusDetail || normalized.websiteStatusDetail,
      href: existing.href || normalized.href,
      rawCells: existing.rawCells.length ? existing.rawCells : normalized.rawCells,
      tags: uniqueStrings([...(existing.tags || []), ...(normalized.tags || [])]),
      warnings: uniqueStrings([...(existing.warnings || []), ...(normalized.warnings || [])]),
      sources: uniqueStrings([...(existing.sources || []), ...(normalized.sources || [])]),
      confidence: confidenceWins ? normalized.confidence : existing.confidence,
      validationSource: normalized.validationSource || existing.validationSource,
      inpiValidationStatus: normalized.inpiValidationStatus || existing.inpiValidationStatus,
      inpiDomains: uniqueStrings([...(existing.inpiDomains || []), ...(normalized.inpiDomains || [])]),
      shouldPersistNoWebsite:
        normalized.shouldPersistNoWebsite === false || existing.shouldPersistNoWebsite === false
          ? false
          : normalized.shouldPersistNoWebsite === true || existing.shouldPersistNoWebsite === true
            ? true
            : undefined
    };

    if (existing.websiteStatus !== 'has_website' && normalized.websiteStatus === 'has_website') {
      next.websiteStatus = 'has_website';
    } else if (existing.websiteStatus === 'unknown' && normalized.websiteStatus !== 'unknown') {
      next.websiteStatus = normalized.websiteStatus;
    } else {
      next.websiteStatus = existing.websiteStatus;
    }

    if (normalized.websiteStatusDetail && next.websiteStatus === normalized.websiteStatus) {
      next.websiteStatusDetail = normalized.websiteStatusDetail;
    }

    merged.set(key, next);
  }

  return Array.from(merged.values());
}

function applyCompanyFilters(items, filters) {
  const query = normalizeStringLower(filters.query);
  const nafCodes = new Set([...(filters.nafCodes || []), ...(filters.apeCodes || [])].map(normalizeStringLower).filter(Boolean));
  const tags = new Set((filters.tags || []).map(normalizeStringLower).filter(Boolean));
  const cities = new Set((filters.cities || []).map(normalizeStringLower).filter(Boolean));
  const departments = new Set((filters.departments || []).map(normalizeStringLower).filter(Boolean));
  const postalCodes = (filters.postalCodes || []).map(normalizeString).filter(Boolean);
  const legalForms = new Set((filters.legalForms || []).map(normalizeStringLower).filter(Boolean));
  const statuses = new Set((filters.statuses || []).map(normalizeStringLower).filter(Boolean));
  const websiteStatus = normalizeWebsiteStatus(filters.websiteStatus);

  return (items || []).filter((item) => {
    if (query) {
      const haystack = [
        item.company,
        item.siren,
        item.siret,
        item.city,
        item.nafCode,
        item.website,
        item.email
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    if (nafCodes.size > 0 && !nafCodes.has(normalizeStringLower(item.nafCode))) {
      return false;
    }

    if (tags.size > 0) {
      const rowTags = new Set((item.tags || []).map(normalizeStringLower).filter(Boolean));
      for (const tag of tags) {
        if (!rowTags.has(tag)) {
          return false;
        }
      }
    }

    if (cities.size > 0 && !cities.has(normalizeStringLower(item.city))) {
      return false;
    }

    if (departments.size > 0 && !departments.has(normalizeStringLower(item.department))) {
      return false;
    }

    if (postalCodes.length > 0) {
      const rowPostalCode = normalizeString(item.postalCode);
      const matchesPostalCode = postalCodes.some((postalCode) => rowPostalCode.startsWith(postalCode));
      if (!matchesPostalCode) {
        return false;
      }
    }

    if (legalForms.size > 0 && !legalForms.has(normalizeStringLower(item.legalForm))) {
      return false;
    }

    if (statuses.size > 0 && !statuses.has(normalizeStringLower(item.status))) {
      return false;
    }

    if (websiteStatus !== 'any' && normalizeWebsiteStatus(item.websiteStatus) !== websiteStatus) {
      return false;
    }

    return true;
  });
}

function paginateItems(items, page, pageSize) {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 25;
  const total = (items || []).length;
  const start = (safePage - 1) * safePageSize;
  const results = (items || []).slice(start, start + safePageSize);

  return {
    items: results,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize))
    }
  };
}

module.exports = {
  WEBSITE_STATUS_VALUES,
  normalizeWebsiteStatus,
  normalizeCompanyRecord,
  mergeCompanyRecords,
  applyCompanyFilters,
  paginateItems,
  companyKey,
  canonicalCompanyName
};
