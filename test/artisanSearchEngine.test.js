'use strict';

process.env.INFONET_MODE = 'mock';

const { createSearchEngine } = require('../src/searchEngine');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function run() {
  const mergeEngine = createSearchEngine({
    infonetClient: {
      mode: 'mock',
      async searchCompanies() {
        return { items: [], warnings: [], mode: 'mock' };
      },
      async dispose() {}
    },
    annuaireProvider: {
      async search() {
        return {
          items: [{
            company: 'ACME ARTISAN',
            siren: '123456789',
            postalCode: '75001',
            city: 'Paris',
            websiteStatus: 'unknown',
            confidence: 'official',
            sources: ['annuaire']
          }],
          warnings: [],
          meta: { provider: 'annuaire', itemCount: 1 }
        };
      }
    },
    artisanProvider: {
      async search() {
        return {
          items: [{
            company: 'Acme Artisan',
            siren: '123456789',
            postalCode: '75001',
            city: 'Paris',
            phoneStatus: 'found',
            phone: '01 02 03 04 05',
            websiteStatus: 'no_website',
            confidence: 'medium',
            sources: ['artisan']
          }],
          warnings: [],
          meta: { provider: 'artisan', itemCount: 1, detailCount: 1, phoneFound: 1 }
        };
      }
    },
    inpiValidator: {
      async validateNoWebsiteCandidates(items) {
        return { items, warnings: [], meta: null };
      }
    }
  });

  const merged = await mergeEngine.searchCompanies({
    providers: ['annuaire', 'artisan'],
    websiteStatus: 'any',
    sortBy: 'name',
    pageSize: 25
  });

  assert(merged.providers.includes('artisan'), 'providers should include artisan');
  assert(merged.items.length === 1, 'annuaire and artisan should merge by siren');
  assert(merged.items[0].sources.includes('annuaire'), 'merged item should keep annuaire source');
  assert(merged.items[0].sources.includes('artisan'), 'merged item should keep artisan source');
  assert(merged.items[0].phoneStatus === 'found', 'merged item should keep artisan phone status');
  await mergeEngine.dispose();

  const inpiEngine = createSearchEngine({
    infonetClient: {
      mode: 'mock',
      async searchCompanies() {
        return { items: [], warnings: [], mode: 'mock' };
      },
      async dispose() {}
    },
    artisanProvider: {
      async search(filters) {
        assert(filters.artisanMetierIds[0] === '141', 'artisan filters should be forwarded');
        return {
          items: [{
            company: 'NO SITE ARTISAN',
            siren: '987654321',
            postalCode: '69000',
            city: 'Lyon',
            websiteStatus: 'no_website',
            confidence: 'medium',
            sources: ['artisan']
          }],
          warnings: [],
          meta: { provider: 'artisan', itemCount: 1 }
        };
      }
    },
    annuaireProvider: {
      async search() {
        return { items: [], warnings: [], meta: { provider: 'annuaire', itemCount: 0 } };
      }
    },
    inpiValidator: {
      isConfigured: true,
      async validateNoWebsiteCandidates(items) {
        return {
          items: items.map((item) => ({
            ...item,
            website: 'https://example-artisan.fr',
            websiteStatus: 'has_website',
            websiteStatusDetail: 'has_website_inpi',
            validationSource: 'inpi',
            inpiValidationStatus: 'confirmed_domain',
            shouldPersistNoWebsite: false,
            sources: [...(item.sources || []), 'inpi']
          })),
          warnings: ['[inpi] reclassified'],
          meta: {
            provider: 'inpi',
            validationEnabled: true,
            checkedCount: 1,
            reclassifiedCount: 1,
            confirmedNoDomainCount: 0,
            manualReviewCount: 0
          }
        };
      }
    }
  });

  const reclassified = await inpiEngine.searchCompanies({
    providers: ['artisan'],
    websiteStatus: 'no_website',
    artisanMetierIds: ['141'],
    pageSize: 25
  });

  assert(reclassified.mode === 'artisan', 'mode should be artisan');
  assert(reclassified.providerResults.some((entry) => entry.provider === 'artisan'), 'provider results should include artisan');
  assert(reclassified.providerResults.some((entry) => entry.provider === 'inpi'), 'provider results should include inpi');
  assert(reclassified.items[0].websiteStatus === 'has_website', 'INPI should reclassify artisan item');
  assert(reclassified.items[0].shouldPersistNoWebsite === false, 'reclassified item should not persist as no website');
  await inpiEngine.dispose();

  console.log('artisanSearchEngine.test.js: all passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
