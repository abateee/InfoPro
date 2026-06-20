'use strict';

process.env.INFONET_MODE = 'mock';
process.env.SEARCH_PROVIDERS = 'infonet';

const { createSearchEngine } = require('../src/searchEngine');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function run() {
  const engine = createSearchEngine();

  const r1 = await engine.searchCompanies({
    providers: ['infonet'],
    websiteStatus: 'no_website',
    cities: ['Lyon'],
    pageSize: 25
  });

  assert(Array.isArray(r1.items), 'items should be array');
  assert(Array.isArray(r1.providers) && r1.providers.includes('infonet'), 'providers should include infonet');
  assert(r1.items.length >= 1, 'should return no_website items for Lyon');
  assert(r1.items.every((item) => item.websiteStatus === 'no_website'), 'all items should be no_website');
  assert(r1.items.every((item) => item.city === 'Lyon'), 'all items should be in Lyon');

  const r2 = await engine.searchCompanies({
    providers: ['infonet'],
    websiteStatus: 'has_website',
    cities: ['Paris'],
    pageSize: 25
  });

  assert(r2.items.length >= 1, 'should return website items for Paris');
  assert(r2.items.every((item) => item.websiteStatus === 'has_website'), 'all items should have website');
  assert(r2.providerResults[0].provider === 'infonet', 'provider result should expose infonet');

  let invalidProviderRejected = false;
  try {
    await engine.searchCompanies({
      providers: ['unknown-provider'],
      pageSize: 25
    });
  } catch (error) {
    invalidProviderRejected = error.message.includes('Invalid provider');
  }
  assert(invalidProviderRejected, 'unknown providers should be rejected');

  await engine.dispose();

  const engineWithInpi = createSearchEngine({
    inpiValidator: {
      isConfigured: true,
      async validateNoWebsiteCandidates(items) {
        const next = (items || [])
          .map((item, index) => {
            if (index === 0) {
              return {
                ...item,
                websiteStatus: 'has_website',
                websiteStatusDetail: 'has_website_inpi',
                validationSource: 'inpi',
                inpiValidationStatus: 'confirmed_domain',
                shouldPersistNoWebsite: false,
                sources: [...(item.sources || []), 'inpi']
              };
            }

            return {
              ...item,
              websiteStatus: 'no_website',
              websiteStatusDetail: 'no_website_inpi_checked',
              validationSource: 'inpi',
              inpiValidationStatus: 'no_domain_found',
              shouldPersistNoWebsite: true,
              sources: [...(item.sources || []), 'inpi']
            };
          })
          .filter((item) => item.websiteStatus === 'no_website');

        return {
          items: next,
          warnings: ['[inpi] mock validation'],
          meta: {
            provider: 'inpi',
            validationEnabled: true,
            checkedCount: items.length,
            reclassifiedCount: 1,
            confirmedNoDomainCount: next.length,
            manualReviewCount: 0
          }
        };
      }
    }
  });

  const r3 = await engineWithInpi.searchCompanies({
    providers: ['infonet'],
    websiteStatus: 'no_website',
    cities: ['Lyon'],
    pageSize: 25
  });

  assert(r3.items.length === 1, 'inpi validation should remove reclassified rows');
  assert(r3.items[0].websiteStatusDetail === 'no_website_inpi_checked', 'remaining row should be INPI-checked');
  assert(r3.items[0].shouldPersistNoWebsite === true, 'remaining row should stay persistable');
  assert(r3.providerResults.some((item) => item.provider === 'inpi'), 'provider results should expose inpi validation');

  await engineWithInpi.dispose();
  console.log('searchEngine.test.js: all passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
