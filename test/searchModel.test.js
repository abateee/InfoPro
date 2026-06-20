'use strict';

const {
  applyCompanyFilters,
  canonicalCompanyName,
  mergeCompanyRecords,
  sortCompanyRecords
} = require('../src/utils/searchModel');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

assert(
  canonicalCompanyName('ACME CONSEIL SAS') === canonicalCompanyName('Acme Conseil'),
  'canonical name should ignore legal suffixes'
);

const merged = mergeCompanyRecords([
  {
    company: 'ACME CONSEIL SAS',
    postalCode: '75001',
    city: 'Paris',
    phone: '01 00 00 00 00',
    websiteStatus: 'no_website',
    sources: ['annuaire']
  },
  {
    company: 'Acme Conseil',
    postalCode: '75001',
    city: 'Paris',
    email: 'hello@acme.example.com',
    websiteStatus: 'no_website',
    sources: ['infonet']
  }
]);

assert(merged.length === 1, 'merge should deduplicate providers on canonical company name + postal code');
assert(merged[0].phone === '01 00 00 00 00', 'merged record should keep phone');
assert(merged[0].email === 'hello@acme.example.com', 'merged record should keep email');
assert(Array.isArray(merged[0].sources) && merged[0].sources.length === 2, 'merged record should keep sources');

const filtered = applyCompanyFilters([
  {
    company: 'PLOMBERIE COTE D OPALE',
    nafCode: '43.22A',
    city: 'Boulogne-sur-Mer',
    department: '62',
    postalCode: '62200',
    legalForm: 'SARL',
    status: 'A',
    creationDate: '2024-01-15',
    email: 'contact@example.com',
    phone: '01 02 03 04 05',
    websiteStatus: 'no_website',
    sources: ['artisan']
  }
], {
  apeCodes: ['4322A'],
  cities: ['boulogne-sur-mer'],
  departments: ['62'],
  postalCodes: ['62200'],
  legalForms: ['sarl'],
  statuses: ['A'],
  isActive: true,
  hasEmail: true,
  hasPhoneNumber: true,
  fromCreationDate: '2024-01-01',
  toCreationDate: '2024-12-31',
  websiteStatus: 'any'
});

assert(filtered.length === 1, 'generic filters should apply consistently across providers');

const financialFiltered = applyCompanyFilters(filtered, {
  minSales: '100000',
  websiteStatus: 'any'
});
assert(financialFiltered.length === 0, 'providers without Infonet financial data should not bypass financial filters');

const sorted = sortCompanyRecords([
  { company: 'Zulu' },
  { company: 'Éclair' },
  { company: 'alpha' }
], { sortBy: 'name', sortOrder: 'asc' });
assert(sorted.map((item) => item.company).join('|') === 'alpha|Éclair|Zulu', 'name sorting should use French collation');

console.log('searchModel.test.js: all passed');
