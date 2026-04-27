const { HttpError } = require('../lib/errors');
const { findCountries, normalizeCountryLookup } = require('../lib/countries');

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

const SEGMENT_STARTERS = [
  'male', 'males', 'man', 'men', 'boy', 'boys',
  'female', 'females', 'woman', 'women', 'girl', 'girls',
  'person', 'persons', 'people',
  'child', 'children', 'kid', 'kids',
  'teen', 'teens', 'teenager', 'teenagers',
  'adult', 'adults',
  'senior', 'seniors', 'elder', 'elders', 'elderly',
];

function invalidQuery(status = 422) {
  throw new HttpError(status, 'Invalid query parameters');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTerm(text, term) {
  return new RegExp(`(^| )${escapeRegExp(term)}( |$)`).test(text);
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => hasTerm(text, term));
}

function prepareInput(input) {
  return String(input).replace(/(\d+)\s*\+/g, '$1 plus');
}

function protectAdjacentGenderPairs(text) {
  return text
    .replace(/\bmale\s+(?:and|or)\s+female\b/g, 'male female')
    .replace(/\bfemale\s+(?:and|or)\s+male\b/g, 'female male')
    .replace(/\bmales\s+(?:and|or)\s+females\b/g, 'males females')
    .replace(/\bfemales\s+(?:and|or)\s+males\b/g, 'females males')
    .replace(/\bmen\s+(?:and|or)\s+women\b/g, 'men women')
    .replace(/\bwomen\s+(?:and|or)\s+men\b/g, 'women men')
    .replace(/\bboys\s+(?:and|or)\s+girls\b/g, 'boys girls')
    .replace(/\bgirls\s+(?:and|or)\s+boys\b/g, 'girls boys');
}

const TWO_WORD_DEMONYM_PATTERN = (
  'south\\s+(?:african|sudanese)|central\\s+african|cape\\s+verdean|' +
  'sierra\\s+leonean|equatorial\\s+guinean|bissau\\s+guinean|sao\\s+tomean'
);
const DEMONYM_TOKEN_PATTERN = (
  '[a-z]+(?:an|ian|ese|ish|ois|eo)|' +
  'french|swiss|dutch|spanish|polish|finnish|scottish|welsh|cypriot|maltese|' +
  'kurdish|swazi|sahrawi|malagasy|basotho|mosotho|burkinabe|tongan|samoan|fijian'
);
const SEGMENT_DEMONYM_PREFIX = (
  `(?:(?:${TWO_WORD_DEMONYM_PATTERN}|${DEMONYM_TOKEN_PATTERN})\\s+)?`
);

function splitSegments(text) {
  const starterPattern = SEGMENT_STARTERS.map(escapeRegExp).join('|');
  const protectedText = protectAdjacentGenderPairs(text);
  return protectedText
    .split(new RegExp(
      `\\s+(?:and|or)\\s+(?=(?:\\d+\\s*(?:plus\\s+)?)?${SEGMENT_DEMONYM_PREFIX}(?:${starterPattern})\\b)`
    ))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isMetricContext(text, index) {
  const before = text.slice(Math.max(0, index - 60), index).trim();
  return /\b(?:probability|confidence|score)(?:\s+(?:is|of))?$/.test(before) ||
    /\b(?:gender|sex|name|country|nationality|nationalize)\s+(?:probability|confidence|score)(?:\s+(?:is|of))?$/.test(before);
}

function readAgeNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    invalidQuery(422);
  }
  return number;
}

function findPatternMatches(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const matches = [];
  let match = regex.exec(text);
  while (match) {
    matches.push(match);
    if (match[0] === '') regex.lastIndex += 1;
    match = regex.exec(text);
  }
  return matches;
}

function findAgeBound(text, patterns, type) {
  for (const pattern of patterns) {
    for (const match of findPatternMatches(text, pattern)) {
      if (isMetricContext(text, match.index)) continue;
      const value = readAgeNumber(match[1]);
      return type === 'min' ? value : value;
    }
  }
  return undefined;
}

function findAgeValue(text, patterns) {
  for (const pattern of patterns) {
    for (const match of findPatternMatches(text, pattern)) {
      if (isMetricContext(text, match.index)) continue;
      return readAgeNumber(match[1]);
    }
  }
  return undefined;
}

function findAgeRange(text) {
  const patterns = [
    /(?:between|from)\s+(?:the\s+)?(?:ages?\s+of\s+)?(\d+)\s+(?:and|to|-)\s+(\d+)(?:\s+(?:inclusive|years?\s+old|yrs?\s+old))?/,
    /from\s+ages?\s+(\d+)\s+(?:and|to|-)\s+(\d+)/,
    /(?:ages?|aged)\s+(\d+)\s+(?:to|through|-)\s+(\d+)/,
    /(\d+)\s*(?:to|-)\s*(\d+)\s*(?:years?\s+old|yrs?\s+old|yo)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const minAge = Number(match[1]);
    const maxAge = Number(match[2]);
    if (
      !Number.isInteger(minAge) ||
      !Number.isInteger(maxAge) ||
      minAge < 0 ||
      maxAge < 0
    ) {
      invalidQuery(422);
    }
    return { min_age: minAge, max_age: maxAge };
  }

  return null;
}

function findAgeDecade(text) {
  const match = text.match(/\b(?:in\s+(?:their|the)\s+)?(\d{1,2})0s\b/);
  if (!match) return null;
  const decade = Number(match[1]) * 10;
  if (!Number.isInteger(decade) || decade < 0 || decade > 990) return null;
  return { min_age: decade, max_age: decade + 9 };
}

function normalizeProbability(value, percentMarker) {
  const normalizedValue = String(value).trim().replace(/^(\d+)\s+(\d+)$/, '$1.$2');
  const probability = Number(normalizedValue);
  if (!Number.isFinite(probability) || probability < 0) invalidQuery(422);
  if (percentMarker || probability > 1) {
    if (probability > 100) invalidQuery(422);
    return probability / 100;
  }
  return probability;
}

function findProbability(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return normalizeProbability(match[1], match[2]);
  }
  return undefined;
}

function parseSort(text) {
  if (text.match(/(^| )(oldest first|highest age|sort by age desc|order by age desc)( |$)/)) {
    return { sort_by: 'age', order: 'desc' };
  }
  if (text.match(/(^| )(youngest first|lowest age|sort by age asc|order by age asc)( |$)/)) {
    return { sort_by: 'age', order: 'asc' };
  }
  if (text.match(/(^| )(newest first|most recent|latest|sort by created at desc|order by created at desc)( |$)/)) {
    return { sort_by: 'created_at', order: 'desc' };
  }
  if (text.match(/(^| )(oldest profiles first|earliest first|sort by created at asc|order by created at asc)( |$)/)) {
    return { sort_by: 'created_at', order: 'asc' };
  }
  if (text.match(/(^| )(highest gender probability|highest gender confidence|sort by gender probability desc|order by gender probability desc)( |$)/)) {
    return { sort_by: 'gender_probability', order: 'desc' };
  }
  if (text.match(/(^| )(lowest gender probability|lowest gender confidence|sort by gender probability asc|order by gender probability asc)( |$)/)) {
    return { sort_by: 'gender_probability', order: 'asc' };
  }
  return {};
}

function ensureValidAgeRange(filters) {
  if (
    filters.min_age !== undefined &&
    filters.max_age !== undefined &&
    filters.min_age > filters.max_age
  ) {
    invalidQuery(422);
  }
}

function parseClause(normalizedText) {
  const filters = {};
  let matched = false;

  const genders = new Set();
  for (const [gender, terms] of Object.entries(GENDER_TERMS)) {
    if (hasAnyTerm(normalizedText, terms)) {
      genders.add(gender);
      matched = true;
    }
  }
  if (genders.size === 1) {
    filters.gender = [...genders][0];
  }

  for (const [ageGroup, terms] of Object.entries(AGE_GROUP_TERMS)) {
    if (hasAnyTerm(normalizedText, terms)) {
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

  const ageRange = findAgeRange(normalizedText) || findAgeDecade(normalizedText);
  if (ageRange) {
    filters.min_age = ageRange.min_age;
    filters.max_age = ageRange.max_age;
    matched = true;
  }

  const minAge = findAgeBound(normalizedText, [
    /(?:above|over|older than|at least)\s+(\d+)/,
    /(?:minimum age|min age|from age)\s+(\d+)/,
    /(?:^| )(\d+)\s*(?:and above|and older|or older|plus)(?: |$)/,
    /(?:not younger than|no younger than)\s+(\d+)/,
  ], 'min');
  const exclusiveMaxAge = findAgeValue(normalizedText, [
    /(?:not up to|younger than|less than|under|below)\s+(\d+)/,
  ]);
  const maxAge = findAgeBound(normalizedText, [
    /(?:at most|up to|no more than|not older than|no older than|maximum age|max age)\s+(\d+)/,
    /(?:less than or equal to|at or below)\s+(\d+)/,
    /(\d+)\s*(?:and below|or younger)/,
  ], 'max');

  if (minAge !== undefined) {
    filters.min_age = minAge;
    matched = true;
  }
  if (exclusiveMaxAge !== undefined) {
    if (exclusiveMaxAge === 0) invalidQuery(422);
    filters.max_age = exclusiveMaxAge - 1;
    matched = true;
  } else if (maxAge !== undefined) {
    filters.max_age = maxAge;
    matched = true;
  }

  const minGenderProbability = findProbability(normalizedText, [
    /(?:gender|sex|name)\s+(?:probability|confidence|score)\s+(?:(?:is|of)\s+)?(?:above|over|greater than|more than|at least|min(?:imum)?(?:\s+of)?)\s+(\d+(?:\s+\d+)?)(\s*percent)?/,
    /(?:gender|sex|name)\s+(?:probability|confidence|score)\s+(\d+(?:\s+\d+)?)(\s*percent)?\s+(?:or above|and above|or higher|and higher|minimum)/,
  ]);
  if (minGenderProbability !== undefined) {
    filters.min_gender_probability = minGenderProbability;
    matched = true;
  }

  const minCountryProbability = findProbability(normalizedText, [
    /(?:country|nationality|nationalize)\s+(?:probability|confidence|score)\s+(?:(?:is|of)\s+)?(?:above|over|greater than|more than|at least|min(?:imum)?(?:\s+of)?)\s+(\d+(?:\s+\d+)?)(\s*percent)?/,
    /(?:country|nationality|nationalize)\s+(?:probability|confidence|score)\s+(\d+(?:\s+\d+)?)(\s*percent)?\s+(?:or above|and above|or higher|and higher|minimum)/,
  ]);
  if (minCountryProbability !== undefined) {
    filters.min_country_probability = minCountryProbability;
    matched = true;
  }

  const countries = findCountries(normalizedText);
  if (countries.length === 1) {
    filters.country_id = countries[0].country_id;
    matched = true;
  } else if (countries.length > 1) {
    filters.country_ids = countries.map((country) => country.country_id);
    matched = true;
  }

  ensureValidAgeRange(filters);

  if (Object.keys(filters).length === 0) {
    throw new HttpError(400, 'Unable to interpret query');
  }

  if (!matched) {
    throw new HttpError(400, 'Unable to interpret query');
  }

  return filters;
}

function parseNaturalLanguageQuery(input) {
  const normalizedText = normalizeCountryLookup(prepareInput(input));
  if (!normalizedText) {
    throw new HttpError(400, 'Unable to interpret query');
  }

  const globalSort = parseSort(normalizedText);
  const segments = splitSegments(normalizedText);
  if (segments.length > 1) {
    const any = segments.map(parseClause);
    return { ...globalSort, any };
  }

  return { ...parseClause(normalizedText), ...globalSort };
}

module.exports = { parseNaturalLanguageQuery };
