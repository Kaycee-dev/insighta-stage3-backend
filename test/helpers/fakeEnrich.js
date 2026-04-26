const { UpstreamError } = require('../../src/lib/errors');

function createFakeEnrich(fixtures = {}) {
  const defaults = {
    emmanuel: { gender: 'male', gender_probability: 0.98, sample_size: 5000, age: 25, country_id: 'NG', country_probability: 0.85 },
    sarah:    { gender: 'female', gender_probability: 0.99, sample_size: 9000, age: 28, country_id: 'US', country_probability: 0.70 },
    ella:     { gender: 'female', gender_probability: 0.99, sample_size: 1234, age: 46, country_id: 'CD', country_probability: 0.85 },
    liam:     { gender: 'male', gender_probability: 0.97, sample_size: 4000, age: 11, country_id: 'US', country_probability: 0.60 },
    grace:    { gender: 'female', gender_probability: 0.95, sample_size: 800, age: 65, country_id: 'GB', country_probability: 0.55 },
    teen:     { gender: 'female', gender_probability: 0.90, sample_size: 400, age: 15, country_id: 'NG', country_probability: 0.65 },
  };
  const store = { ...defaults, ...fixtures };

  return async function enrich(name) {
    const key = name.trim().toLowerCase();
    if (store[key] === 'GENDERIZE_FAIL') throw new UpstreamError('Genderize');
    if (store[key] === 'AGIFY_FAIL') throw new UpstreamError('Agify');
    if (store[key] === 'NATIONALIZE_FAIL') throw new UpstreamError('Nationalize');
    if (!store[key]) throw new UpstreamError('Genderize');
    return { ...store[key] };
  };
}

module.exports = { createFakeEnrich };
