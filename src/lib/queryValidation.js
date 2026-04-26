const { HttpError } = require('./errors');
const {
  VALID_GENDERS,
  VALID_AGE_GROUPS,
  normalizeAgeGroup,
  normalizeCountryId,
  normalizeGender,
} = require('./profiles');

const LIST_KEYS = new Set([
  'gender',
  'age_group',
  'country_id',
  'min_age',
  'max_age',
  'min_gender_probability',
  'min_country_probability',
  'sort_by',
  'order',
  'page',
  'limit',
]);

const EXPORT_KEYS = new Set([
  'format',
  'gender',
  'age_group',
  'country_id',
  'min_age',
  'max_age',
  'min_gender_probability',
  'min_country_probability',
  'sort_by',
  'order',
]);

const SEARCH_KEYS = new Set([
  'q',
  'sort_by',
  'order',
  'page',
  'limit',
]);

const SORT_FIELDS = new Set(['age', 'created_at', 'gender_probability']);
const SORT_ORDERS = new Set(['asc', 'desc']);

function invalidQuery(status = 422) {
  throw new HttpError(status, 'Invalid query parameters');
}

function ensureAllowedKeys(query, allowedKeys) {
  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) {
      invalidQuery(422);
    }
  }
}

function readSingleValue(query, key) {
  const value = query[key];
  if (Array.isArray(value)) {
    invalidQuery(422);
  }
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    invalidQuery(422);
  }
  if (value.trim() === '') {
    invalidQuery(400);
  }
  return value.trim();
}

function readInteger(query, key, { min, max, clampMax = false, required = false, defaultValue } = {}) {
  const raw = readSingleValue(query, key);
  if (raw === undefined) {
    if (required) invalidQuery(400);
    return defaultValue;
  }
  if (!/^-?\d+$/.test(raw)) {
    invalidQuery(422);
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    invalidQuery(422);
  }
  if (min !== undefined && value < min) {
    invalidQuery(422);
  }
  if (max !== undefined && value > max) {
    if (clampMax) return max;
    invalidQuery(422);
  }
  return value;
}

function readProbability(query, key) {
  const raw = readSingleValue(query, key);
  if (raw === undefined) return undefined;
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    invalidQuery(422);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    invalidQuery(422);
  }
  return value;
}

function readSortAndPagination(query) {
  const filters = {
    page: readInteger(query, 'page', { min: 1, defaultValue: 1 }),
    limit: readInteger(query, 'limit', { min: 1, max: 50, clampMax: true, defaultValue: 10 }),
    sort_by: 'created_at',
    order: 'asc',
  };

  const gender = readSingleValue(query, 'gender');
  if (gender !== undefined) {
    const normalized = normalizeGender(gender);
    if (!VALID_GENDERS.has(normalized)) {
      invalidQuery(422);
    }
    filters.gender = normalized;
  }

  const ageGroup = readSingleValue(query, 'age_group');
  if (ageGroup !== undefined) {
    const normalized = normalizeAgeGroup(ageGroup);
    if (!VALID_AGE_GROUPS.has(normalized)) {
      invalidQuery(422);
    }
    filters.age_group = normalized;
  }

  const countryId = readSingleValue(query, 'country_id');
  if (countryId !== undefined) {
    const normalized = normalizeCountryId(countryId);
    if (!/^[A-Z]{2}$/.test(normalized)) {
      invalidQuery(422);
    }
    filters.country_id = normalized;
  }

  filters.min_age = readInteger(query, 'min_age', { min: 0 });
  filters.max_age = readInteger(query, 'max_age', { min: 0 });
  filters.min_gender_probability = readProbability(query, 'min_gender_probability');
  filters.min_country_probability = readProbability(query, 'min_country_probability');

  const sortBy = readSingleValue(query, 'sort_by');
  if (sortBy !== undefined) {
    const normalized = sortBy.toLowerCase();
    if (!SORT_FIELDS.has(normalized)) {
      invalidQuery(422);
    }
    filters.sort_by = normalized;
  }

  const order = readSingleValue(query, 'order');
  if (order !== undefined) {
    const normalized = order.toLowerCase();
    if (!SORT_ORDERS.has(normalized)) {
      invalidQuery(422);
    }
    filters.order = normalized;
  }

  return filters;
}

function validateListQuery(query) {
  ensureAllowedKeys(query, LIST_KEYS);

  const filters = readSortAndPagination(query);

  if (
    filters.min_age !== undefined &&
    filters.max_age !== undefined &&
    filters.min_age > filters.max_age
  ) {
    invalidQuery(422);
  }

  return filters;
}

function validateSearchQuery(query) {
  ensureAllowedKeys(query, SEARCH_KEYS);
  const filters = readSortAndPagination(query);
  const q = readSingleValue(query, 'q');
  if (q === undefined) {
    invalidQuery(400);
  }
  return { ...filters, q };
}

function validateExportQuery(query) {
  ensureAllowedKeys(query, EXPORT_KEYS);
  const format = readSingleValue(query, 'format');
  if (format !== 'csv') {
    invalidQuery(format === undefined ? 400 : 422);
  }
  const filters = readSortAndPagination(query);
  delete filters.page;
  delete filters.limit;
  return filters;
}

module.exports = {
  invalidQuery,
  validateExportQuery,
  validateListQuery,
  validateSearchQuery,
};
