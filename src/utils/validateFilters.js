'use strict';

const MAX_LIST_LENGTH = 50;
const MAX_QUERY_LENGTH = 200;
const MAX_STRING_FIELD_LENGTH = 500;
const MAX_PAGE_SIZE = 500;
const MAX_ARTISAN_ENRICH_LIMIT = 500;

const LIST_KEYS = [
  'nafCodes',
  'apeCodes',
  'tags',
  'cities',
  'postalCodes',
  'departments',
  'legalForms',
  'statuses',
  'sectorCodes',
  'artisanMetierIds',
  'artisanActivityIds',
  'artisanCityIds',
  'artisanDepartments',
  'providers'
];

function validateFilters(filters) {
  if (!filters || typeof filters !== 'object') {
    return { valid: false, error: 'Invalid filters object.' };
  }

  if (filters.query && filters.query.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: `Query must be at most ${MAX_QUERY_LENGTH} characters.` };
  }

  for (const key of LIST_KEYS) {
    const list = filters[key];
    if (Array.isArray(list) && list.length > MAX_LIST_LENGTH) {
      return { valid: false, error: `Too many values for ${key} (max ${MAX_LIST_LENGTH}).` };
    }
  }

  const stringFields = [
    'staff',
    'minSales',
    'maxSales',
    'minNetIncome',
    'maxNetIncome',
    'fromCreationDate',
    'toCreationDate',
    'riskNonPaymentsNormalized',
    'quotations',
    'websiteStatus'
  ];
  for (const key of stringFields) {
    const val = filters[key];
    if (val && String(val).length > MAX_STRING_FIELD_LENGTH) {
      return { valid: false, error: `Field ${key} must be at most ${MAX_STRING_FIELD_LENGTH} characters.` };
    }
  }

  const pageSize = Number(filters.pageSize);
  if (Number.isFinite(pageSize) && (pageSize < 1 || pageSize > MAX_PAGE_SIZE)) {
    return { valid: false, error: `pageSize must be between 1 and ${MAX_PAGE_SIZE}.` };
  }

  const maxPages = Number(filters.maxPages);
  if (Number.isFinite(maxPages) && (maxPages < 1 || maxPages > 20)) {
    return { valid: false, error: 'maxPages must be between 1 and 20.' };
  }

  const artisanDetailLimit = Number(filters.artisanDetailLimit);
  if (Number.isFinite(artisanDetailLimit) && (artisanDetailLimit < 0 || artisanDetailLimit > MAX_ARTISAN_ENRICH_LIMIT)) {
    return { valid: false, error: `artisanDetailLimit must be between 0 and ${MAX_ARTISAN_ENRICH_LIMIT}.` };
  }

  const artisanPhoneLimit = Number(filters.artisanPhoneLimit);
  if (Number.isFinite(artisanPhoneLimit) && (artisanPhoneLimit < 0 || artisanPhoneLimit > MAX_ARTISAN_ENRICH_LIMIT)) {
    return { valid: false, error: `artisanPhoneLimit must be between 0 and ${MAX_ARTISAN_ENRICH_LIMIT}.` };
  }

  return { valid: true };
}

module.exports = { validateFilters };
