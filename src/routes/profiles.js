const express = require('express');
const { uuidv7 } = require('uuidv7');
const { enrichName: defaultEnrich } = require('../services/external');
const { ageGroup } = require('../services/classify');
const defaultRepo = require('../repo/profiles');
const { success, error } = require('../lib/respond');
const { getCountryName } = require('../lib/countries');
const { validateExportQuery, validateListQuery, validateSearchQuery } = require('../lib/queryValidation');
const { parseNaturalLanguageQuery } = require('../services/queryParser');
const { normalizeName } = require('../lib/profiles');
const { withPaginationLinks } = require('../lib/pagination');
const { profilesToCsv } = require('../lib/csv');
const { requireRole } = require('../middleware/auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createRouter(options = {}) {
  const { repo = defaultRepo, enrichName = defaultEnrich } = options;
  const router = express.Router();
  const adminOnly = options.authRequired === false
    ? (req, res, next) => next()
    : requireRole('admin');
  const shapePagination = (req, result) => (
    options.apiVersionRequired === false ? result : withPaginationLinks(req, result)
  );

  router.post('/', adminOnly, async (req, res, next) => {
    try {
      const body = req.body || {};
      if (!('name' in body) || body.name === null || body.name === undefined) {
        return error(res, 400, 'Missing or empty name');
      }
      if (typeof body.name !== 'string') {
        return error(res, 422, 'Invalid type');
      }
      const trimmed = normalizeName(body.name);
      if (trimmed.length === 0) {
        return error(res, 400, 'Missing or empty name');
      }

      const enriched = await enrichName(trimmed);
      const countryName = getCountryName(enriched.country_id);
      if (!countryName) {
        return error(res, 502, 'Nationalize returned an invalid response');
      }
      const profile = {
        id: uuidv7(),
        name: trimmed,
        gender: enriched.gender,
        gender_probability: enriched.gender_probability,
        age: enriched.age,
        age_group: ageGroup(enriched.age),
        country_id: enriched.country_id,
        country_name: countryName,
        country_probability: enriched.country_probability,
      };

      const { inserted, row } = await repo.insertOrGet(profile);
      if (inserted) {
        return success(res, 201, { data: row });
      }
      return success(res, 200, { message: 'Profile already exists', data: row });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const filters = validateListQuery(req.query);
      const result = await repo.queryProfiles(filters);
      return success(res, 200, shapePagination(req, result));
    } catch (err) {
      next(err);
    }
  });

  router.get('/export', async (req, res, next) => {
    try {
      const filters = validateExportQuery(req.query);
      const rows = await repo.exportProfiles(filters);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="profiles_${timestamp}.csv"`);
      return res.status(200).send(profilesToCsv(rows));
    } catch (err) {
      next(err);
    }
  });

  router.get('/search', async (req, res, next) => {
    try {
      const { q, ...options } = validateSearchQuery(req.query);
      const parsedFilters = parseNaturalLanguageQuery(q);
      const result = await repo.queryProfiles({ ...options, ...parsedFilters });
      return success(res, 200, shapePagination(req, result));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) return error(res, 404, 'Profile not found');
      const row = await repo.findById(id);
      if (!row) return error(res, 404, 'Profile not found');
      return success(res, 200, { data: row });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', adminOnly, async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) return error(res, 404, 'Profile not found');
      const ok = await repo.deleteById(id);
      if (!ok) return error(res, 404, 'Profile not found');
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createRouter };
