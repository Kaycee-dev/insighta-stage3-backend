const fs = require('fs');
const path = require('path');
const { uuidv7 } = require('uuidv7');
const { getPool } = require('./db');
const { getCountryRegistry } = require('./lib/countries');
const {
  VALID_AGE_GROUPS,
  VALID_GENDERS,
  normalizeAgeGroup,
  normalizeCountryId,
  normalizeCountryName,
  normalizeGender,
  normalizeName,
} = require('./lib/profiles');
const { ageGroup } = require('./services/classify');

const BATCH_SIZE = 250;

function loadSeedProfiles() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'seed_profiles.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.profiles)) {
    throw new Error('seed_profiles.json must contain a profiles array');
  }
  return parsed.profiles;
}

function validateSeedProfile(profile, seenNames) {
  const normalized = {
    name: normalizeName(profile.name),
    gender: normalizeGender(profile.gender),
    gender_probability: Number(profile.gender_probability),
    age: Number(profile.age),
    age_group: normalizeAgeGroup(profile.age_group),
    country_id: normalizeCountryId(profile.country_id),
    country_name: normalizeCountryName(profile.country_name),
    country_probability: Number(profile.country_probability),
  };

  if (!normalized.name) {
    throw new Error('Seed profile name is required');
  }
  const nameKey = normalized.name.toLowerCase();
  if (seenNames.has(nameKey)) {
    throw new Error(`Duplicate seed profile name: ${normalized.name}`);
  }
  seenNames.add(nameKey);

  if (!VALID_GENDERS.has(normalized.gender)) {
    throw new Error(`Invalid seed gender for ${normalized.name}`);
  }
  if (!Number.isInteger(normalized.age) || normalized.age < 0) {
    throw new Error(`Invalid seed age for ${normalized.name}`);
  }
  if (!VALID_AGE_GROUPS.has(normalized.age_group) || ageGroup(normalized.age) !== normalized.age_group) {
    throw new Error(`Invalid seed age_group for ${normalized.name}`);
  }
  if (!/^[A-Z]{2}$/.test(normalized.country_id)) {
    throw new Error(`Invalid seed country_id for ${normalized.name}`);
  }
  if (!normalized.country_name) {
    throw new Error(`Invalid seed country_name for ${normalized.name}`);
  }
  if (
    !Number.isFinite(normalized.gender_probability) ||
    normalized.gender_probability < 0 ||
    normalized.gender_probability > 1
  ) {
    throw new Error(`Invalid seed gender_probability for ${normalized.name}`);
  }
  if (
    !Number.isFinite(normalized.country_probability) ||
    normalized.country_probability < 0 ||
    normalized.country_probability > 1
  ) {
    throw new Error(`Invalid seed country_probability for ${normalized.name}`);
  }

  return normalized;
}

function prepareSeedProfiles() {
  const profiles = loadSeedProfiles();
  const seenNames = new Set();
  return profiles.map((profile) => validateSeedProfile(profile, seenNames));
}

function buildCountryBackfillSql(byId) {
  const entries = [...byId.entries()];
  const clauses = [];
  const params = [];

  for (const [countryId, countryName] of entries) {
    params.push(countryId, countryName);
    clauses.push(`WHEN country_id = $${params.length - 1} THEN $${params.length}`);
  }

  const sql = `
    UPDATE profiles
    SET
      name = BTRIM(name),
      gender = LOWER(BTRIM(gender)),
      age_group = LOWER(BTRIM(age_group)),
      country_id = UPPER(BTRIM(country_id)),
      country_name = CASE
        ${clauses.join('\n        ')}
        ELSE country_name
      END
    WHERE
      country_name IS NULL
      OR country_name = ''
      OR name <> BTRIM(name)
      OR gender <> LOWER(BTRIM(gender))
      OR age_group <> LOWER(BTRIM(age_group))
      OR country_id <> UPPER(BTRIM(country_id))
  `;

  return { sql, params };
}

function buildInsertBatch(batch) {
  const values = [];
  const params = [];

  for (const profile of batch) {
    params.push(
      uuidv7(),
      profile.name,
      profile.gender,
      profile.gender_probability,
      profile.age,
      profile.age_group,
      profile.country_id,
      profile.country_name,
      profile.country_probability
    );
    const offset = params.length - 8;
    values.push(
      `($${offset},$${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8})`
    );
  }

  const sql = `
    INSERT INTO profiles
      (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability)
    VALUES ${values.join(', ')}
    ON CONFLICT ((LOWER(BTRIM(name)))) DO NOTHING
  `;

  return { sql, params };
}

async function seedDatabase() {
  const profiles = prepareSeedProfiles();
  const pool = getPool();
  const client = await pool.connect();
  const registry = getCountryRegistry();

  try {
    await client.query('BEGIN');

    const backfill = buildCountryBackfillSql(registry.byId);
    if (backfill.params.length > 0) {
      await client.query(backfill.sql, backfill.params);
    }

    for (let index = 0; index < profiles.length; index += BATCH_SIZE) {
      const batch = profiles.slice(index, index + BATCH_SIZE);
      const statement = buildInsertBatch(batch);
      await client.query(statement.sql, statement.params);
    }

    await client.query('COMMIT');
    console.log(`[seed] ensured ${profiles.length} profiles`);
    return { total: profiles.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[seed] error:', error);
      process.exit(1);
    });
}

module.exports = {
  loadSeedProfiles,
  prepareSeedProfiles,
  seedDatabase,
};
