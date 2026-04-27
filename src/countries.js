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

const DEMONYMS = {
  AO: ['angolan', 'angolans'],
  AU: ['australian', 'australians', 'aussie', 'aussies'],
  BF: ['burkinabe', 'burkinabes', 'burkinabé', 'burkinabés'],
  BI: ['burundian', 'burundians'],
  BJ: ['beninese'],
  BR: ['brazilian', 'brazilians'],
  BW: ['motswana', 'batswana', 'botswanan', 'botswanans'],
  CA: ['canadian', 'canadians'],
  CD: ['congolese'],
  CF: ['central african', 'central africans'],
  CG: ['congolese'],
  CI: ['ivorian', 'ivorians'],
  CM: ['cameroonian', 'cameroonians'],
  CN: ['chinese'],
  CV: ['cape verdean', 'cape verdeans', 'cabo verdean', 'cabo verdeans'],
  DE: ['german', 'germans'],
  DJ: ['djiboutian', 'djiboutians'],
  DZ: ['algerian', 'algerians'],
  EG: ['egyptian', 'egyptians'],
  EH: ['sahrawi', 'sahrawis', 'sahrawian'],
  ER: ['eritrean', 'eritreans'],
  ET: ['ethiopian', 'ethiopians'],
  FR: ['french', 'frenchman', 'frenchmen', 'frenchwoman', 'frenchwomen'],
  GA: ['gabonese'],
  GB: ['british', 'briton', 'britons', 'englishman', 'englishmen', 'englishwoman', 'englishwomen'],
  GH: ['ghanaian', 'ghanaians'],
  GM: ['gambian', 'gambians'],
  GN: ['guinean', 'guineans'],
  GQ: ['equatoguinean', 'equatoguineans', 'equatorial guinean', 'equatorial guineans'],
  GW: ['bissau guinean', 'bissau guineans'],
  IN: ['indian', 'indians'],
  JP: ['japanese'],
  KE: ['kenyan', 'kenyans'],
  KM: ['comorian', 'comorians'],
  LR: ['liberian', 'liberians'],
  LS: ['mosotho', 'basotho', 'lesothan', 'lesothans'],
  LY: ['libyan', 'libyans'],
  MA: ['moroccan', 'moroccans'],
  MG: ['malagasy', 'madagascan', 'madagascans'],
  ML: ['malian', 'malians'],
  MR: ['mauritanian', 'mauritanians'],
  MU: ['mauritian', 'mauritians'],
  MW: ['malawian', 'malawians'],
  MZ: ['mozambican', 'mozambicans'],
  NA: ['namibian', 'namibians'],
  NE: ['nigerien', 'nigeriens'],
  NG: ['nigerian', 'nigerians'],
  RW: ['rwandan', 'rwandans'],
  SC: ['seychellois'],
  SD: ['sudanese'],
  SL: ['sierra leonean', 'sierra leoneans'],
  SN: ['senegalese'],
  SO: ['somali', 'somalis', 'somalian', 'somalians'],
  SS: ['south sudanese'],
  ST: ['sao tomean', 'sao tomeans'],
  SZ: ['swazi', 'swazis'],
  TD: ['chadian', 'chadians'],
  TG: ['togolese'],
  TN: ['tunisian', 'tunisians'],
  TZ: ['tanzanian', 'tanzanians'],
  UG: ['ugandan', 'ugandans'],
  US: ['american', 'americans'],
  ZA: ['south african', 'south africans'],
  ZM: ['zambian', 'zambians'],
  ZW: ['zimbabwean', 'zimbabweans'],
};

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
    addLookup(byLookup, id, name, name.replace(/^the\s+/i, ''));
  }

  const aliases = {
    CD: ['dr congo', 'drc', 'democratic republic of congo', 'democratic republic of the congo'],
    CG: ['congo republic'],
    CI: ['ivory coast', 'cote divoire'],
    GB: ['uk', 'britain', 'great britain', 'england'],
    US: ['usa', 'united states of america'],
  };

  for (const [countryId, names] of Object.entries(aliases)) {
    const countryName = byId.get(countryId);
    if (!countryName) continue;
    for (const alias of names) {
      addLookup(byLookup, countryId, countryName, alias);
    }
  }

  for (const [countryId, demonyms] of Object.entries(DEMONYMS)) {
    const countryName = byId.get(countryId);
    if (!countryName) continue;
    for (const demonym of demonyms) {
      addLookup(byLookup, countryId, countryName, demonym);
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
  const countries = findCountries(text);
  return countries[0] || null;
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function findCountries(text) {
  const haystack = ` ${normalizeCountryLookup(text)} `;
  const matches = [];

  for (const candidate of getCountryRegistry().searchable) {
    const needle = ` ${candidate.lookup} `;
    const start = haystack.indexOf(needle);
    if (start === -1) continue;
    const range = { start, end: start + needle.length };
    if (matches.some((match) => rangesOverlap(match, range))) {
      continue;
    }
    matches.push({
      ...range,
      country_id: candidate.country_id,
      country_name: candidate.country_name,
    });
  }

  return matches
    .sort((a, b) => a.start - b.start)
    .map(({ country_id, country_name }) => ({ country_id, country_name }));
}

module.exports = {
  normalizeCountryLookup,
  getCountryRegistry,
  getCountryName,
  findCountry,
  findCountries,
};
