'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { LeadStore } = require('../src/leadStore');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'infopro-leads-'));

try {
  const store = new LeadStore({ baseDir: tempDir });

  const first = store.upsertSearchResults([
    {
      company: 'TEST SANS SITE',
      siren: '111222333',
      siret: '11122233300011',
      city: 'Paris',
      department: '75',
      postalCode: '75001',
      phone: '01 23 45 67 89',
      email: 'contact@test.example.com',
      websiteStatus: 'no_website',
      websiteStatusDetail: 'no_website_inpi_checked',
      validationSource: 'inpi',
      inpiValidationStatus: 'no_domain_found',
      sources: ['infonet']
    }
  ]);

  assert(first.addedCount === 1, 'first insert should add 1 lead');
  assert(first.items[0].leadKey, 'saved item should expose leadKey');
  assert(fs.existsSync(path.join(tempDir, 'sans site.txt')), 'text file should exist');
  assert(fs.existsSync(path.join(tempDir, 'leads.json')), 'json file should exist');

  const second = store.upsertSearchResults([
    {
      company: 'TEST SANS SITE',
      siren: '111222333',
      siret: '11122233300011',
      city: 'Paris',
      department: '75',
      postalCode: '75001',
      websiteStatus: 'no_website',
      sources: ['infonet']
    }
  ]);

  assert(second.addedCount === 0, 'second insert should not add a duplicate');
  assert(second.updatedCount === 1, 'second insert should update existing lead');

  const skipped = store.upsertSearchResults([
    {
      company: 'FAUX SANS SITE',
      siren: '999888777',
      siret: '99988877700011',
      city: 'Lyon',
      department: '69',
      postalCode: '69001',
      websiteStatus: 'no_website',
      validationSource: 'inpi',
      inpiValidationStatus: 'error',
      shouldPersistNoWebsite: false,
      sources: ['infonet', 'inpi']
    }
  ]);

  assert(skipped.addedCount === 0, 'non validated no_website should not be persisted');

  const updated = store.upsertLead({
    leadKey: first.items[0].leadKey,
    company: 'TEST SANS SITE',
    status: 'contacted',
    notes: 'Appel effectue',
    followUpAt: '2026-03-20T09:00:00.000Z'
  });

  assert(updated.status === 'contacted', 'lead status should be updated');
  assert(updated.notes === 'Appel effectue', 'lead notes should be updated');

  const leads = store.listLeads();
  assert(leads.length === 1, 'store should contain one lead');
  assert(leads[0].status === 'contacted', 'listed lead should contain updated status');
  assert(leads[0].websiteStatusDetail === 'no_website_inpi_checked', 'stored lead should keep website status detail');
  assert(leads[0].validationSource === 'inpi', 'stored lead should keep validation source');
  assert(leads[0].inpiValidationStatus === 'no_domain_found', 'stored lead should keep INPI validation status');

  console.log('leadStore.test.js: all passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
