'use strict';

process.env.INFONET_MODE = 'mock';

const { createInfonetClient } = require('../src/infonetClient');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function run() {
  const client = createInfonetClient();
  assert(client.mode === 'mock', 'mode should be mock');

  const r1 = await client.searchCompanies({});
  assert(Array.isArray(r1.items), 'items should be array');
  assert(r1.pagination && typeof r1.pagination.total === 'number', 'pagination.total');
  assert(r1.pagination.page >= 1, 'pagination.page');
  assert(r1.mode === 'mock', 'mode mock');

  const r2 = await client.searchCompanies({ query: 'ACME' });
  assert(r2.items.length >= 1, 'query ACME should return at least 1');
  assert(r2.items.some((i) => i.company && i.company.includes('ACME')), 'should contain ACME');

  const r3 = await client.searchCompanies({ cities: ['Paris'] });
  assert(Array.isArray(r3.items), 'cities filter');
  assert(r3.items.every((i) => i.city === 'Paris'), 'all items should be Paris');

  const r4 = await client.searchCompanies({ departments: ['75'] });
  assert(r4.items.every((i) => i.department === '75'), 'departments filter');

  const r5 = await client.searchCompanies({ page: 1, pageSize: 2 });
  assert(r5.items.length <= 2, 'pageSize 2');
  assert(r5.pagination.pageSize === 2, 'pagination.pageSize');

  const r6 = await client.searchCompanies({ websiteStatus: 'has_website' });
  assert(r6.items.length >= 1, 'has_website should return at least 1');
  assert(r6.items.every((i) => i.websiteStatus === 'has_website'), 'all items should have website');

  const r7 = await client.searchCompanies({ websiteStatus: 'no_website', cities: ['Lyon'] });
  assert(r7.items.length >= 1, 'Lyon no_website should return at least 1');
  assert(r7.items.every((i) => i.websiteStatus === 'no_website'), 'all items should be no_website');
  assert(r7.items.every((i) => i.city === 'Lyon'), 'all no_website Lyon items should be Lyon');

  await client.dispose();
  console.log('infonetClient.test.js: all passed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
