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

const v4 = validateFilters({ pageSize: 200 });
assert(v4.valid === false, 'pageSize > 100');

const v5 = validateFilters({ maxPages: 25 });
assert(v5.valid === false, 'maxPages > 20');

console.log('validateFilters.test.js: all passed');
