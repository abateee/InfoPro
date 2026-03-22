'use strict';

const { InpiValidator } = require('../src/inpiValidator');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function run() {
  const validator = new InpiValidator({
    maxChecks: 10,
    client: {
      isConfigured: true,
      async validateCompanyWebsite(siren) {
        if (siren === '111111111') {
          return {
            checked: true,
            status: 'confirmed_domain',
            domains: ['acme.fr'],
            website: 'https://acme.fr'
          };
        }

        if (siren === '222222222') {
          return {
            checked: true,
            status: 'no_domain_found',
            domains: [],
            website: ''
          };
        }

        return {
          checked: false,
          status: 'error',
          domains: [],
          website: '',
          error: 'mock error'
        };
      }
    }
  });

  const baseItems = [
    {
      company: 'ACME',
      siren: '111111111',
      websiteStatus: 'no_website',
      sources: ['infonet']
    },
    {
      company: 'BETA',
      siren: '222222222',
      websiteStatus: 'no_website',
      sources: ['infonet']
    },
    {
      company: 'GAMMA',
      siren: '333333333',
      websiteStatus: 'no_website',
      sources: ['infonet']
    },
    {
      company: 'DELTA',
      siren: '444444444',
      websiteStatus: 'has_website',
      sources: ['annuaire']
    }
  ];

  const anyResult = await validator.validateNoWebsiteCandidates(baseItems, { websiteStatus: 'any' });
  const acme = anyResult.items.find((item) => item.siren === '111111111');
  const beta = anyResult.items.find((item) => item.siren === '222222222');
  const gamma = anyResult.items.find((item) => item.siren === '333333333');

  assert(anyResult.meta.provider === 'inpi', 'validator should expose inpi meta');
  assert(anyResult.meta.checkedCount === 3, 'validator should check three no_website candidates');
  assert(anyResult.meta.reclassifiedCount === 1, 'validator should reclassify confirmed domains');
  assert(anyResult.meta.confirmedNoDomainCount === 1, 'validator should confirm one no-domain record');
  assert(anyResult.meta.manualReviewCount === 1, 'validator should count manual review rows');
  assert(acme.websiteStatus === 'has_website', 'confirmed domain should switch to has_website');
  assert(acme.website === 'https://acme.fr', 'confirmed domain should expose website URL');
  assert(acme.confidence === 'official', 'confirmed domain should raise confidence');
  assert(beta.websiteStatus === 'no_website', 'no_domain_found should stay no_website');
  assert(beta.shouldPersistNoWebsite === true, 'no_domain_found should remain persistable');
  assert(Array.isArray(beta.sources) && beta.sources.includes('inpi'), 'no_domain_found should add inpi source');
  assert(gamma.websiteStatus === 'unknown', 'errors should move candidate to unknown');
  assert(gamma.shouldPersistNoWebsite === false, 'errors should not be persisted');
  assert(anyResult.warnings.some((entry) => entry.includes('mock error')), 'validator should expose INPI errors in warnings');

  const noWebsiteOnly = await validator.validateNoWebsiteCandidates(baseItems, { websiteStatus: 'no_website' });
  assert(noWebsiteOnly.items.length === 1, 'no_website filter should keep only confirmed no-domain rows');
  assert(noWebsiteOnly.items[0].siren === '222222222', 'remaining no_website row should be the INPI-confirmed one');

  console.log('inpiValidator.test.js: all passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
