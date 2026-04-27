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

test('query parser maps between-age phrases into inclusive min and max age filters', () => {
  assert.deepEqual(
    parseNaturalLanguageQuery('women from tanzania between the ages of 50 and 54 inclusive'),
    {
      gender: 'female',
      min_age: 50,
      max_age: 54,
      country_id: 'TZ',
    }
  );

  assert.deepEqual(parseNaturalLanguageQuery('people aged 18 to 21 from kenya'), {
    min_age: 18,
    max_age: 21,
    country_id: 'KE',
  });
});

test('query parser maps multi-segment demographic clauses into OR filters', () => {
  assert.deepEqual(
    parseNaturalLanguageQuery('40+ men from angola that are not up to 67 years old and women from ghana that are younger than 36 years'),
    {
      any: [
        {
          gender: 'male',
          min_age: 40,
          max_age: 66,
          country_id: 'AO',
        },
        {
          gender: 'female',
          max_age: 35,
          country_id: 'GH',
        },
      ],
    }
  );
});

test('query parser supports repeated countries and probability thresholds in one clause', () => {
  assert.deepEqual(
    parseNaturalLanguageQuery('men from angola and ghana with gender probability at least 90 percent and country confidence at least 80 percent'),
    {
      gender: 'male',
      country_ids: ['AO', 'GH'],
      min_gender_probability: 0.9,
      min_country_probability: 0.8,
    }
  );
});

test('query parser supports every flat search field in one clause', () => {
  assert.deepEqual(
    parseNaturalLanguageQuery(
      'adult women from kenya at least 30 years old not older than 45 with gender confidence is at least 80 percent and country probability 70 percent or above highest gender confidence'
    ),
    {
      gender: 'female',
      age_group: 'adult',
      min_age: 30,
      max_age: 45,
      min_gender_probability: 0.8,
      min_country_probability: 0.7,
      country_id: 'KE',
      sort_by: 'gender_probability',
      order: 'desc',
    }
  );
});

test('query parser supports repeated countries inside multiple demographic clauses', () => {
  assert.deepEqual(
    parseNaturalLanguageQuery('men from angola and ghana and women from kenya and nigeria'),
    {
      any: [
        {
          gender: 'male',
          country_ids: ['AO', 'GH'],
        },
        {
          gender: 'female',
          country_ids: ['KE', 'NG'],
        },
      ],
    }
  );
});

test('query parser handles inclusive and exclusive age-bound synonyms', () => {
  assert.deepEqual(parseNaturalLanguageQuery('children under 13 from ghana'), {
    age_group: 'child',
    max_age: 12,
    country_id: 'GH',
  });

  assert.deepEqual(parseNaturalLanguageQuery('seniors 60 or older from ghana'), {
    age_group: 'senior',
    min_age: 60,
    country_id: 'GH',
  });
});

test('query parser maps natural sort phrases to supported sort fields', () => {
  assert.deepEqual(parseNaturalLanguageQuery('adult males from kenya oldest first'), {
    gender: 'male',
    age_group: 'adult',
    country_id: 'KE',
    sort_by: 'age',
    order: 'desc',
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

test('query parser maps decade phrases like "in their 50s" into inclusive ranges', () => {
  assert.deepEqual(parseNaturalLanguageQuery('women in their 50s'), {
    gender: 'female',
    min_age: 50,
    max_age: 59,
  });

  assert.deepEqual(parseNaturalLanguageQuery('men in their 40s'), {
    gender: 'male',
    min_age: 40,
    max_age: 49,
  });

  assert.deepEqual(parseNaturalLanguageQuery('kenyans in their 30s'), {
    min_age: 30,
    max_age: 39,
    country_id: 'KE',
  });
});

test('query parser does not treat short prepositions as country aliases', () => {
  assert.deepEqual(parseNaturalLanguageQuery('women in their 50s'), {
    gender: 'female',
    min_age: 50,
    max_age: 59,
  });

  assert.deepEqual(parseNaturalLanguageQuery('men in their 40s from nigeria'), {
    gender: 'male',
    min_age: 40,
    max_age: 49,
    country_id: 'NG',
  });
});

test('query parser resolves common demonyms to country ids', () => {
  assert.deepEqual(parseNaturalLanguageQuery('canadian men'), {
    gender: 'male',
    country_id: 'CA',
  });

  assert.deepEqual(parseNaturalLanguageQuery('british teens'), {
    age_group: 'teenager',
    country_id: 'GB',
  });

  assert.deepEqual(parseNaturalLanguageQuery('south african adults'), {
    age_group: 'adult',
    country_id: 'ZA',
  });

  assert.deepEqual(parseNaturalLanguageQuery('americans aged 25 to 35'), {
    min_age: 25,
    max_age: 35,
    country_id: 'US',
  });
});

test('query parser splits compound clauses with adjective-prefixed starters', () => {
  assert.deepEqual(
    parseNaturalLanguageQuery('women from ethiopia in their 50s and canadian men in their 40s'),
    {
      any: [
        {
          gender: 'female',
          min_age: 50,
          max_age: 59,
          country_id: 'ET',
        },
        {
          gender: 'male',
          min_age: 40,
          max_age: 49,
          country_id: 'CA',
        },
      ],
    }
  );

  assert.deepEqual(
    parseNaturalLanguageQuery('german men in the 60s and french women in the 70s'),
    {
      any: [
        {
          gender: 'male',
          min_age: 60,
          max_age: 69,
          country_id: 'DE',
        },
        {
          gender: 'female',
          min_age: 70,
          max_age: 79,
          country_id: 'FR',
        },
      ],
    }
  );
});
