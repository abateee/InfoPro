'use strict';

const { validateFilters } = require('../src/utils/validateFilters');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

const v = validateFilters({ query: 'x', pageSize: 25 });
assert(v.valid === true, 'valid filters');

const v2 = validateFilters({ query: 'x'.repeat(300) });
assert(v2.valid === false && v2.error.includes('200'), 'query too long');

const v3 = validateFilters({ nafCodes: Array(60).fill('x') });
assert(v3.valid === false && v3.error.includes('50'), 'list too long');

const v4 = validateFilters({ pageSize: 500, artisanDetailLimit: 500, artisanPhoneLimit: 500 });
assert(v4.valid === true, 'large Artisan batch should be valid');

const v5 = validateFilters({ maxPages: 25 });
assert(v5.valid === false, 'maxPages > 20');

const v6 = validateFilters({ pageSize: 501 });
assert(v6.valid === false, 'pageSize > 500');

const v7 = validateFilters({ artisanDetailLimit: 501 });
assert(v7.valid === false, 'artisanDetailLimit > 500');

console.log('validateFilters.test.js: all passed');
