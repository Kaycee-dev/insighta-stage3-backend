const {
  formatTimestamp,
  normalizeAgeGroup,
  normalizeCountryId,
  normalizeGender,
  normalizeNameKey,
  toProfileRecord,
} = require('../../src/lib/profiles');

function createMemoryRepo() {
  const rows = new Map();
  const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0);
  let sequence = 0;

  function nextCreatedAt() {
    const createdAt = new Date(baseTime + (sequence * 1000));
    sequence += 1;
    return formatTimestamp(createdAt);
  }

  function fullShape(row) {
    return { ...row };
  }

  function compareValues(left, right, order) {
    if (left < right) return order === 'desc' ? 1 : -1;
    if (left > right) return order === 'desc' ? -1 : 1;
    return 0;
  }

  return {
    _rows: rows,
    async insertOrGet(profile) {
      const nameKey = normalizeNameKey(profile.name);
      for (const row of rows.values()) {
        if (normalizeNameKey(row.name) === nameKey) {
          return { inserted: false, row: fullShape(row) };
        }
      }

      const stored = {
        ...toProfileRecord(profile),
        created_at: nextCreatedAt(),
      };
      rows.set(stored.id, stored);
      return { inserted: true, row: fullShape(stored) };
    },
    async findById(id) {
      const row = rows.get(id);
      return row ? fullShape(row) : null;
    },
    async deleteById(id) {
      return rows.delete(id);
    },
    async queryProfiles(options = {}) {
      const filtered = [...rows.values()].filter((row) => {
        if (options.gender && row.gender !== normalizeGender(options.gender)) return false;
        if (options.age_group && row.age_group !== normalizeAgeGroup(options.age_group)) return false;
        if (options.country_id && row.country_id !== normalizeCountryId(options.country_id)) return false;
        if (options.min_age !== undefined && row.age < options.min_age) return false;
        if (options.max_age !== undefined && row.age > options.max_age) return false;
        if (
          options.min_gender_probability !== undefined &&
          row.gender_probability < options.min_gender_probability
        ) return false;
        if (
          options.min_country_probability !== undefined &&
          row.country_probability < options.min_country_probability
        ) return false;
        return true;
      });

      const sortBy = options.sort_by || 'created_at';
      const order = options.order || 'asc';
      filtered.sort((left, right) => {
        const primary = compareValues(left[sortBy], right[sortBy], order);
        if (primary !== 0) return primary;
        return compareValues(left.id, right.id, order);
      });

      const page = options.page || 1;
      const limit = options.limit || 10;
      const start = (page - 1) * limit;

      return {
        page,
        limit,
        total: filtered.length,
        data: filtered.slice(start, start + limit).map(fullShape),
      };
    },
    async exportProfiles(options = {}) {
      const result = await this.queryProfiles({
        ...options,
        page: 1,
        limit: Number.MAX_SAFE_INTEGER,
      });
      return result.data;
    },
    size() {
      return rows.size;
    },
  };
}

module.exports = { createMemoryRepo };
