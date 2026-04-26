const VALID_GENDERS = new Set(['male', 'female']);
const VALID_AGE_GROUPS = new Set(['child', 'teenager', 'adult', 'senior']);
const ISO_Z_RE = /\.\d{3}Z$/;

function formatTimestamp(value) {
  return new Date(value).toISOString().replace(ISO_Z_RE, 'Z');
}

function normalizeName(value) {
  return String(value).trim();
}

function normalizeNameKey(value) {
  return normalizeName(value).toLowerCase();
}

function normalizeGender(value) {
  return String(value).trim().toLowerCase();
}

function normalizeAgeGroup(value) {
  return String(value).trim().toLowerCase();
}

function normalizeCountryId(value) {
  return String(value).trim().toUpperCase();
}

function normalizeCountryName(value) {
  return String(value).trim();
}

function toProfileRecord(profile) {
  return {
    id: profile.id,
    name: normalizeName(profile.name),
    gender: normalizeGender(profile.gender),
    gender_probability: Number(profile.gender_probability),
    age: Number(profile.age),
    age_group: normalizeAgeGroup(profile.age_group),
    country_id: normalizeCountryId(profile.country_id),
    country_name: normalizeCountryName(profile.country_name),
    country_probability: Number(profile.country_probability),
  };
}

module.exports = {
  VALID_GENDERS,
  VALID_AGE_GROUPS,
  formatTimestamp,
  normalizeName,
  normalizeNameKey,
  normalizeGender,
  normalizeAgeGroup,
  normalizeCountryId,
  normalizeCountryName,
  toProfileRecord,
};
