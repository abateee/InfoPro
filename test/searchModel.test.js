'use strict';

const {
  canonicalCompanyName,
  mergeCompanyRecords
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

console.log('searchModel.test.js: all passed');
