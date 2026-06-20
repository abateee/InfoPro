'use strict';

const {
  toList,
  toString,
  toCheckedOrEmpty,
  toCsv,
  boolAsFlag,
  numberOrDefault
} = require('../src/utils/filters');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || 'Expected equal') + ': ' + sa + ' !== ' + sb);
}

// toList
assertEqual(toList('a,b,c'), ['a', 'b', 'c']);
assertEqual(toList('  a , b  '), ['a', 'b']);
assertEqual(toList(''), []);
assertEqual(toList(null), []);
assertEqual(toList(['x', 'y']), ['x', 'y']);
assertEqual(toList(['  x  ', '']), ['x']);

// toString
assertEqual(toString('  abc  '), 'abc');
assertEqual(toString(null), '');
assertEqual(toString(123), '123');

// toCheckedOrEmpty
assert(toCheckedOrEmpty(true) === true);
assert(toCheckedOrEmpty('true') === true);
assert(toCheckedOrEmpty('1') === true);
assert(toCheckedOrEmpty(1) === true);
assert(toCheckedOrEmpty(false) === '');
assert(toCheckedOrEmpty('') === '');

// toCsv
assertEqual(toCsv(['a', 'b', 'c']), 'a,b,c');
assertEqual(toCsv('  a  '), 'a');
assertEqual(toCsv([]), '');
assertEqual(toCsv(''), '');

// boolAsFlag
assertEqual(boolAsFlag(true), '1');
assertEqual(boolAsFlag('true'), '1');
assertEqual(boolAsFlag(1), '1');
assertEqual(boolAsFlag(false), '');
assertEqual(boolAsFlag(''), '');

// numberOrDefault
assertEqual(numberOrDefault(0, 10), 0);
assertEqual(numberOrDefault('0', 10), 0);
assertEqual(numberOrDefault('', 10), 10);
assertEqual(numberOrDefault(undefined, 10), 10);

console.log('filters.test.js: all passed');
