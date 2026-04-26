const { HttpError } = require('../lib/errors');
const { findCountry, normalizeCountryLookup } = require('../lib/countries');

const GENDER_TERMS = {
  male: ['male', 'males', 'man', 'men', 'boy', 'boys'],
  female: ['female', 'females', 'woman', 'women', 'girl', 'girls'],
};

const AGE_GROUP_TERMS = {
  child: ['child', 'children', 'kid', 'kids'],
  teenager: ['teen', 'teens', 'teenager', 'teenagers'],
  adult: ['adult', 'adults'],
  senior: ['senior', 'seniors', 'elder', 'elders', 'elderly'],
};

function invalidQuery(status = 422) {
  throw new HttpError(status, 'Invalid query parameters');
}

function findAgeBound(text, patterns, type) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isInteger(value) || value < 0) {
      invalidQuery(422);
    }
    return type === 'min' ? value : value;
  }
  return undefined;
}

function parseNaturalLanguageQuery(input) {
  const normalizedText = normalizeCountryLookup(input);
  if (!normalizedText) {
    throw new HttpError(400, 'Unable to interpret query');
  }

  const filters = {};
  let matched = false;

  const genders = new Set();
  for (const [gender, terms] of Object.entries(GENDER_TERMS)) {
    if (terms.some((term) => normalizedText.match(new RegExp(`(^| )${term}( |$)`)))) {
      genders.add(gender);
      matched = true;
    }
  }
  if (genders.size === 1) {
    filters.gender = [...genders][0];
  }

  for (const [ageGroup, terms] of Object.entries(AGE_GROUP_TERMS)) {
    if (terms.some((term) => normalizedText.match(new RegExp(`(^| )${term}( |$)`)))) {
      filters.age_group = ageGroup;
      matched = true;
      break;
    }
  }

  if (normalizedText.match(/(^| )young( |$)/)) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  }

  const minAge = findAgeBound(normalizedText, [
    /(?:above|over|older than|at least)\s+(\d+)/,
    /(\d+)\s*(?:and above|\+|plus)/,
  ], 'min');
  const maxAge = findAgeBound(normalizedText, [
    /(?:below|under|younger than|at most)\s+(\d+)/,
    /(\d+)\s*(?:and below|or younger)/,
  ], 'max');

  if (minAge !== undefined) {
    filters.min_age = minAge;
    matched = true;
  }
  if (maxAge !== undefined) {
    filters.max_age = maxAge;
    matched = true;
  }

  const country = findCountry(normalizedText);
  if (country) {
    filters.country_id = country.country_id;
    matched = true;
  }

  if (
    filters.min_age !== undefined &&
    filters.max_age !== undefined &&
    filters.min_age > filters.max_age
  ) {
    invalidQuery(422);
  }

  if (Object.keys(filters).length === 0) {
    throw new HttpError(400, 'Unable to interpret query');
  }

  if (!matched) {
    throw new HttpError(400, 'Unable to interpret query');
  }

  return filters;
}

module.exports = { parseNaturalLanguageQuery };
