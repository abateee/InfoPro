'use strict';

const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

assert(html.includes('id="providerInfonet"'), 'UI should expose Infonet source checkbox');
assert(html.includes('id="providerAnnuaire"'), 'UI should expose Annuaire source checkbox');
assert(html.includes('id="providerArtisan"'), 'UI should expose Artisan source checkbox');
assert(html.includes('id="artisanMetierIds"'), 'UI should expose Artisan metier select');
assert(html.includes('id="artisanActivityIds"'), 'UI should expose Artisan activity select');
assert(html.includes('id="artisanDepartment"'), 'UI should expose Artisan department select');
assert(html.includes('id="artisanCityIds"'), 'UI should expose Artisan city select');
assert(html.includes('id="artisanAutoPhone"'), 'UI should expose Artisan auto phone option');
assert(html.includes('id="pageSize" type="number" min="1" max="500"'), 'UI should allow 500 visible rows');
assert(html.includes('id="artisanDetailLimit" type="number" min="0" max="500"'), 'UI should allow 500 Artisan details');
assert(html.includes('id="artisanPhoneLimit" type="number" min="0" max="500"'), 'UI should allow 500 Artisan phones');

assert(app.includes('function selectedProviders()'), 'payload should use selectedProviders');
assert(app.includes("artisanMetierIds: useArtisan ? selectedValues('artisanMetierIds') : []"), 'payload should include artisanMetierIds');
assert(app.includes("artisanActivityIds: useArtisan ? selectedValues('artisanActivityIds') : []"), 'payload should include artisanActivityIds');
assert(app.includes("artisanCityIds: useArtisan ? selectedValues('artisanCityIds') : []"), 'payload should include artisanCityIds');
assert(app.includes("artisanAutoPhone: useArtisan && boolFromCheckbox('artisanAutoPhone')"), 'payload should include Artisan auto-phone only when selected');
assert(app.includes("const useArtisan = providers.includes('artisan')"), 'payload should isolate Artisan-only fields');
assert(app.includes('selectionnez au moins une source'), 'UI should reject an empty provider selection');
assert(app.includes('function applyArtisanBulkDefaults()'), 'UI should expose Artisan bulk defaults');
assert(app.includes("raiseNumberInput('pageSize', 250)"), 'Artisan bulk defaults should raise page size');
assert(app.includes("raiseNumberInput('artisanDetailLimit', 250)"), 'Artisan bulk defaults should raise detail limit');
assert(app.includes("fetch('/api/provider-options/artisan'"), 'UI should fetch Artisan options');
assert(app.includes('/api/provider-options/artisan/cities'), 'UI should fetch Artisan cities');
assert(app.includes("value: 'phoneStatus'"), 'Artisan sort should expose phoneStatus');
assert(!app.includes("getEl('providers')"), 'UI should not use legacy providers CSV input');

console.log('uiPayload.test.js: all passed');
