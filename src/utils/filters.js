'use strict';

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function toString(value) {
  return String(value || '').trim();
}

function toCheckedOrEmpty(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return true;
  }
  return '';
}

function toCsv(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean).join(',');
  }
  return String(value || '').trim();
}

function boolAsFlag(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return '1';
  }
  return '';
}

function numberOrDefault(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return Number(fallback);
  }

  return Number(value);
}

module.exports = {
  toList,
  toString,
  toCheckedOrEmpty,
  toCsv,
  boolAsFlag,
  numberOrDefault
};
