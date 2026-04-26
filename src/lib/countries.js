const fs = require('fs');
const path = require('path');

let registry = null;

function normalizeCountryLookup(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function loadSeedProfiles() {
  const filePath = path.join(__dirname, '..', '..', 'seed_profiles.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.profiles) ? parsed.profiles : [];
}

function addLookup(map, id, name, alias) {
  const lookup = normalizeCountryLookup(alias || name);
  if (!lookup) return;
  map.set(lookup, { country_id: id, country_name: name, lookup });
}

function buildRegistry() {
  const profiles = loadSeedProfiles();
  const byId = new Map();
  const byLookup = new Map();

  for (const profile of profiles) {
    const id = String(profile.country_id).trim().toUpperCase();
    const name = String(profile.country_name).trim();
    if (!id || !name || byId.has(id)) continue;
    byId.set(id, name);
    addLookup(byLookup, id, name, name);
    addLookup(byLookup, id, name, id);
    addLookup(byLookup, id, name, name.replace(/^the\s+/i, ''));
  }

  const aliases = {
    CD: ['dr congo', 'drc', 'democratic republic of congo', 'democratic republic of the congo'],
    CG: ['congo republic'],
    CI: ['ivory coast', 'cote divoire'],
    GB: ['uk', 'britain', 'great britain'],
    US: ['usa', 'united states of america'],
  };

  for (const [countryId, names] of Object.entries(aliases)) {
    const countryName = byId.get(countryId);
    if (!countryName) continue;
    for (const alias of names) {
      addLookup(byLookup, countryId, countryName, alias);
    }
  }

  const searchable = [...byLookup.values()].sort((a, b) => b.lookup.length - a.lookup.length);
  return { byId, byLookup, searchable };
}

function getCountryRegistry() {
  if (!registry) {
    registry = buildRegistry();
  }
  return registry;
}

function getCountryName(countryId) {
  return getCountryRegistry().byId.get(String(countryId).trim().toUpperCase()) || null;
}

function findCountry(text) {
  const haystack = ` ${normalizeCountryLookup(text)} `;
  for (const candidate of getCountryRegistry().searchable) {
    if (haystack.includes(` ${candidate.lookup} `)) {
      return { country_id: candidate.country_id, country_name: candidate.country_name };
    }
  }
  return null;
}

module.exports = {
  normalizeCountryLookup,
  getCountryRegistry,
  getCountryName,
  findCountry,
};
