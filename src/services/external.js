const { UpstreamError } = require('../lib/errors');
const { pickTopCountry } = require('./classify');

const GENDERIZE = process.env.GENDERIZE_URL || 'https://api.genderize.io';
const AGIFY = process.env.AGIFY_URL || 'https://api.agify.io';
const NATIONALIZE = process.env.NATIONALIZE_URL || 'https://api.nationalize.io';
const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url, apiName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new UpstreamError(apiName);
    return await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(apiName);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGenderize(name) {
  const data = await fetchWithTimeout(`${GENDERIZE}?name=${encodeURIComponent(name)}`, 'Genderize');
  if (data.gender === null || data.gender === undefined || !data.count || data.count <= 0) {
    throw new UpstreamError('Genderize');
  }
  return {
    gender: String(data.gender),
    gender_probability: Number(data.probability),
    sample_size: Number(data.count),
  };
}

async function fetchAgify(name) {
  const data = await fetchWithTimeout(`${AGIFY}?name=${encodeURIComponent(name)}`, 'Agify');
  if (data.age === null || data.age === undefined) {
    throw new UpstreamError('Agify');
  }
  return { age: Number(data.age) };
}

async function fetchNationalize(name) {
  const data = await fetchWithTimeout(`${NATIONALIZE}?name=${encodeURIComponent(name)}`, 'Nationalize');
  const top = pickTopCountry(data.country);
  if (!top || !top.country_id) {
    throw new UpstreamError('Nationalize');
  }
  return {
    country_id: String(top.country_id),
    country_probability: Number(top.probability),
  };
}

async function enrichName(name) {
  const [g, a, n] = await Promise.allSettled([
    fetchGenderize(name),
    fetchAgify(name),
    fetchNationalize(name),
  ]);
  const gender = g.status === 'fulfilled'
    ? g.value
    : { gender: 'unknown', gender_probability: 0, sample_size: 0 };
  const age = a.status === 'fulfilled'
    ? a.value
    : { age: 0 };
  const nationality = n.status === 'fulfilled'
    ? n.value
    : { country_id: 'US', country_probability: 0 };
  return { ...gender, ...age, ...nationality };
}

module.exports = { enrichName, fetchGenderize, fetchAgify, fetchNationalize };
