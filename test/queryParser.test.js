const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNaturalLanguageQuery } = require('../src/services/queryParser');

test('query parser maps young males from nigeria into gender, age range, and country filters', () => {
  assert.deepEqual(parseNaturalLanguageQuery('young males from nigeria'), {
    gender: 'male',
    min_age: 16,
    max_age: 24,
    country_id: 'NG',
  });
});

test('query parser omits gender when both male and female are present', () => {
  assert.deepEqual(parseNaturalLanguageQuery('male and female teenagers above 17'), {
    age_group: 'teenager',
    min_age: 17,
  });
});

test('query parser normalizes country aliases from the seed-backed registry', () => {
  assert.deepEqual(parseNaturalLanguageQuery('adults from dr congo'), {
    age_group: 'adult',
    country_id: 'CD',
  });
});

test('query parser rejects contradictory bounds as invalid query parameters', () => {
  assert.throws(
    () => parseNaturalLanguageQuery('young females above 30'),
    /Invalid query parameters/
  );
});

test('query parser rejects text with no usable rules', () => {
  assert.throws(
    () => parseNaturalLanguageQuery('clouds and dreams'),
    /Unable to interpret query/
  );
});
