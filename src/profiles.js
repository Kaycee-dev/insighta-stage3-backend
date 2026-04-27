const { query } = require('../db');
const {
  formatTimestamp,
  normalizeAgeGroup,
  normalizeCountryId,
  normalizeGender,
  normalizeNameKey,
  toProfileRecord,
} = require('../lib/profiles');

const SORT_COLUMNS = {
  age: 'age',
  created_at: 'created_at',
  gender_probability: 'gender_probability',
};

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: Number(row.gender_probability),
    age: Number(row.age),
    age_group: row.age_group,
    country_id: row.country_id,
    country_name: row.country_name,
    country_probability: Number(row.country_probability),
    created_at: formatTimestamp(row.created_at),
  };
}

function appendFilterConditions(options, params) {
  const conditions = [];
  if (options.gender) {
    params.push(normalizeGender(options.gender));
    conditions.push(`gender = $${params.length}`);
  }
  if (options.age_group) {
    params.push(normalizeAgeGroup(options.age_group));
    conditions.push(`age_group = $${params.length}`);
  }
  if (options.country_id) {
    params.push(normalizeCountryId(options.country_id));
    conditions.push(`country_id = $${params.length}`);
  }
  if (Array.isArray(options.country_ids) && options.country_ids.length > 0) {
    const placeholders = options.country_ids.map((countryId) => {
      params.push(normalizeCountryId(countryId));
      return `$${params.length}`;
    });
    conditions.push(`country_id IN (${placeholders.join(', ')})`);
  }
  if (options.min_age !== undefined) {
    params.push(options.min_age);
    conditions.push(`age >= $${params.length}`);
  }
  if (options.max_age !== undefined) {
    params.push(options.max_age);
    conditions.push(`age <= $${params.length}`);
  }
  if (options.min_gender_probability !== undefined) {
    params.push(options.min_gender_probability);
    conditions.push(`gender_probability >= $${params.length}`);
  }
  if (options.min_country_probability !== undefined) {
    params.push(options.min_country_probability);
    conditions.push(`country_probability >= $${params.length}`);
  }
  return conditions;
}

function buildWhere(options) {
  const filters = [];
  const params = [];
  const directConditions = appendFilterConditions(options, params);
  if (directConditions.length > 0) {
    filters.push(...directConditions);
  }

  if (Array.isArray(options.any) && options.any.length > 0) {
    const anyConditions = [];
    for (const clause of options.any) {
      const clauseConditions = appendFilterConditions(clause, params);
      if (clauseConditions.length > 0) {
        anyConditions.push(`(${clauseConditions.join(' AND ')})`);
      }
    }
    if (anyConditions.length > 0) {
      filters.push(`(${anyConditions.join(' OR ')})`);
    }
  }

  return {
    params,
    where: filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '',
  };
}

function sortClause(options) {
  const sortColumn = SORT_COLUMNS[options.sort_by] || SORT_COLUMNS.created_at;
  const sortOrder = options.order === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${sortColumn} ${sortOrder}, id ${sortOrder}`;
}

async function insertOrGet(profile) {
  const insertSql = `
    INSERT INTO profiles
      (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT ((LOWER(BTRIM(name)))) DO NOTHING
    RETURNING
      id,
      name,
      gender,
      gender_probability,
      age,
      age_group,
      country_id,
      country_name,
      country_probability,
      created_at AT TIME ZONE 'UTC' AS created_at
  `;
  const record = toProfileRecord(profile);
  const params = [
    record.id,
    record.name,
    record.gender,
    record.gender_probability,
    record.age,
    record.age_group,
    record.country_id,
    record.country_name,
    record.country_probability,
  ];
  const insertResult = await query(insertSql, params);
  if (insertResult.rows.length > 0) {
    return { inserted: true, row: serialize(insertResult.rows[0]) };
  }
  const existing = await query(
    `
      SELECT
        id,
        name,
        gender,
        gender_probability,
        age,
        age_group,
        country_id,
        country_name,
        country_probability,
        created_at AT TIME ZONE 'UTC' AS created_at
      FROM profiles
      WHERE LOWER(BTRIM(name)) = $1
    `,
    [normalizeNameKey(record.name)]
  );
  return { inserted: false, row: serialize(existing.rows[0]) };
}

async function findById(id) {
  const { rows } = await query(
    `
      SELECT
        id,
        name,
        gender,
        gender_probability,
        age,
        age_group,
        country_id,
        country_name,
        country_probability,
        created_at AT TIME ZONE 'UTC' AS created_at
      FROM profiles
      WHERE id = $1
    `,
    [id]
  );
  return rows[0] ? serialize(rows[0]) : null;
}

async function deleteById(id) {
  const { rowCount } = await query('DELETE FROM profiles WHERE id = $1', [id]);
  return rowCount > 0;
}

async function queryProfiles(options) {
  const { params, where } = buildWhere(options);
  const totalResult = await query(`SELECT COUNT(*)::int AS total FROM profiles ${where}`, params);

  params.push(options.limit, (options.page - 1) * options.limit);
  const limitPosition = params.length - 1;
  const offsetPosition = params.length;
  const { rows } = await query(
    `
      SELECT
        id,
        name,
        gender,
        gender_probability,
        age,
        age_group,
        country_id,
        country_name,
        country_probability,
        created_at AT TIME ZONE 'UTC' AS created_at
      FROM profiles
      ${where}
      ${sortClause(options)}
      LIMIT $${limitPosition}
      OFFSET $${offsetPosition}
    `,
    params
  );

  return {
    page: options.page,
    limit: options.limit,
    total: totalResult.rows[0].total,
    data: rows.map(serialize),
  };
}

async function exportProfiles(options) {
  const { params, where } = buildWhere(options);
  const { rows } = await query(
    `
      SELECT
        id,
        name,
        gender,
        gender_probability,
        age,
        age_group,
        country_id,
        country_name,
        country_probability,
        created_at AT TIME ZONE 'UTC' AS created_at
      FROM profiles
      ${where}
      ${sortClause(options)}
    `,
    params
  );
  return rows.map(serialize);
}

module.exports = { deleteById, exportProfiles, findById, insertOrGet, queryProfiles, serialize };
