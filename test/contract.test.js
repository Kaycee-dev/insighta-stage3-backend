const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createMemoryRepo } = require('./helpers/memoryRepo');
const { createFakeEnrich } = require('./helpers/fakeEnrich');

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const PROFILE_KEYS = [
  'age',
  'age_group',
  'country_id',
  'country_name',
  'country_probability',
  'created_at',
  'gender',
  'gender_probability',
  'id',
  'name',
];

const SEARCH_FIXTURES = {
  ayo: { gender: 'male', gender_probability: 0.93, sample_size: 1200, age: 18, country_id: 'KE', country_probability: 0.92 },
  zuri: { gender: 'female', gender_probability: 0.88, sample_size: 1100, age: 18, country_id: 'AO', country_probability: 0.77 },
  kamau: { gender: 'male', gender_probability: 0.91, sample_size: 1500, age: 34, country_id: 'KE', country_probability: 0.81 },
  ada: { gender: 'female', gender_probability: 0.87, sample_size: 1400, age: 34, country_id: 'NG', country_probability: 0.88 },
  kwame: { gender: 'male', gender_probability: 0.69, sample_size: 1600, age: 42, country_id: 'GH', country_probability: 0.45 },
  lola: { gender: 'female', gender_probability: 0.74, sample_size: 1700, age: 21, country_id: 'NG', country_probability: 0.40 },
  tunde: { gender: 'male', gender_probability: 0.82, sample_size: 900, age: 19, country_id: 'NG', country_probability: 0.90 },
};

function newApp(fixtures = {}) {
  const repo = createMemoryRepo();
  const enrichName = createFakeEnrich(fixtures);
  const app = createApp({ repo, enrichName, authRequired: false, apiVersionRequired: false, logger: () => {} });
  return { app, repo };
}

async function seedNames(app, names) {
  for (const name of names) {
    const res = await request(app).post('/api/profiles').send({ name });
    assert.equal(res.status, 201, `failed to seed ${name}`);
  }
}

test('POST new profile returns Stage 2 shape, UUID v7, and UTC timestamp', async () => {
  const { app } = newApp();
  const res = await request(app).post('/api/profiles').send({ name: 'ella' });

  assert.equal(res.status, 201);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(res.body.status, 'success');
  assert.deepEqual(Object.keys(res.body.data).sort(), PROFILE_KEYS);
  assert.match(res.body.data.id, UUID_V7);
  assert.match(res.body.data.created_at, ISO_Z);
  assert.equal(res.body.data.country_id, 'CD');
  assert.equal(res.body.data.country_name, 'DR Congo');
});

test('POST duplicate name remains idempotent after trimming and case normalization', async () => {
  const { app, repo } = newApp();
  const first = await request(app).post('/api/profiles').send({ name: 'Ella' });
  const duplicate = await request(app).post('/api/profiles').send({ name: '  ella  ' });

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.message, 'Profile already exists');
  assert.equal(duplicate.body.data.id, first.body.data.id);
  assert.equal(repo.size(), 1);
});

test('POST validation returns the Stage 1 name errors for missing, empty, and invalid values', async () => {
  const { app } = newApp();

  const missing = await request(app).post('/api/profiles').send({});
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body, { status: 'error', message: 'Missing or empty name' });

  const empty = await request(app).post('/api/profiles').send({ name: '   ' });
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.body, { status: 'error', message: 'Missing or empty name' });

  const invalid = await request(app).post('/api/profiles').send({ name: 42 });
  assert.equal(invalid.status, 422);
  assert.deepEqual(invalid.body, { status: 'error', message: 'Invalid type' });
});

test('upstream failures still return 502 and do not persist rows', async () => {
  const { app, repo } = newApp({
    badgender: 'GENDERIZE_FAIL',
    badage: 'AGIFY_FAIL',
    badnat: 'NATIONALIZE_FAIL',
  });

  const genderFail = await request(app).post('/api/profiles').send({ name: 'badgender' });
  const ageFail = await request(app).post('/api/profiles').send({ name: 'badage' });
  const natFail = await request(app).post('/api/profiles').send({ name: 'badnat' });

  assert.equal(genderFail.status, 502);
  assert.equal(genderFail.body.message, 'Genderize returned an invalid response');
  assert.equal(ageFail.status, 502);
  assert.equal(ageFail.body.message, 'Agify returned an invalid response');
  assert.equal(natFail.status, 502);
  assert.equal(natFail.body.message, 'Nationalize returned an invalid response');
  assert.equal(repo.size(), 0);
});

test('GET by id returns the Stage 2 profile shape', async () => {
  const { app } = newApp();
  const created = await request(app).post('/api/profiles').send({ name: 'emmanuel' });
  const got = await request(app).get(`/api/profiles/${created.body.data.id}`);

  assert.equal(got.status, 200);
  assert.deepEqual(Object.keys(got.body.data).sort(), PROFILE_KEYS);
  assert.equal(got.body.data.country_name, 'Nigeria');
  assert.equal(got.body.data.gender_probability, 0.98);
  assert.equal(got.body.data.country_probability, 0.85);
});

test('GET by id keeps 404 behavior for unknown and malformed UUIDs', async () => {
  const { app } = newApp();

  const missing = await request(app).get('/api/profiles/01860000-0000-7000-8000-000000000000');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { status: 'error', message: 'Profile not found' });

  const malformed = await request(app).get('/api/profiles/not-a-uuid');
  assert.equal(malformed.status, 404);
});

test('GET /api/profiles returns page, limit, total, and full profile rows by default', async () => {
  const { app } = newApp();
  await seedNames(app, ['emmanuel', 'sarah']);

  const res = await request(app).get('/api/profiles');

  assert.equal(res.status, 200);
  assert.deepEqual(
    Object.keys(res.body).sort(),
    ['data', 'limit', 'page', 'status', 'total']
  );
  assert.equal(res.body.page, 1);
  assert.equal(res.body.limit, 10);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.data.length, 2);
  assert.deepEqual(Object.keys(res.body.data[0]).sort(), PROFILE_KEYS);
});

test('GET /api/profiles supports combined filters with age and probability thresholds', async () => {
  const { app } = newApp(SEARCH_FIXTURES);
  await seedNames(app, ['emmanuel', 'ayo', 'kamau', 'kwame', 'sarah']);

  const res = await request(app).get(
    '/api/profiles?gender=male&age_group=adult&country_id=ke&min_age=30&min_gender_probability=0.9&min_country_probability=0.8'
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].name, 'kamau');
});

test('GET /api/profiles sorts deterministically and paginates with total count', async () => {
  const { app } = newApp(SEARCH_FIXTURES);
  await seedNames(app, ['emmanuel', 'sarah', 'grace', 'kamau']);

  const sorted = await request(app).get('/api/profiles?sort_by=age&order=desc');
  assert.equal(sorted.status, 200);
  assert.deepEqual(sorted.body.data.map((profile) => profile.name), ['grace', 'kamau', 'sarah', 'emmanuel']);

  const paged = await request(app).get('/api/profiles?page=2&limit=2&sort_by=created_at&order=asc');
  assert.equal(paged.status, 200);
  assert.equal(paged.body.page, 2);
  assert.equal(paged.body.limit, 2);
  assert.equal(paged.body.total, 4);
  assert.deepEqual(paged.body.data.map((profile) => profile.name), ['grace', 'kamau']);
});

test('GET /api/profiles rejects invalid filter and pagination parameters', async () => {
  const { app } = newApp();

  const zeroLimit = await request(app).get('/api/profiles?limit=0');
  assert.equal(zeroLimit.status, 422);
  assert.deepEqual(zeroLimit.body, { status: 'error', message: 'Invalid query parameters' });

  const invalidSort = await request(app).get('/api/profiles?sort_by=name');
  assert.equal(invalidSort.status, 422);
  assert.deepEqual(invalidSort.body, { status: 'error', message: 'Invalid query parameters' });
});

test('GET /api/profiles clamps limit to 50 when above the max', async () => {
  const { app } = newApp();

  const overMax = await request(app).get('/api/profiles?limit=100');
  assert.equal(overMax.status, 200);
  assert.equal(overMax.body.limit, 50);
});

test('GET /api/profiles/search maps young males from nigeria into structured filters', async () => {
  const { app } = newApp(SEARCH_FIXTURES);
  await seedNames(app, ['emmanuel', 'tunde', 'sarah']);

  const res = await request(app).get('/api/profiles/search?q=young%20males%20from%20nigeria');

  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.deepEqual(res.body.data.map((profile) => profile.name), ['tunde']);
});

test('GET /api/profiles/search handles age phrases and country matching', async () => {
  const { app } = newApp(SEARCH_FIXTURES);
  await seedNames(app, ['ella', 'ada', 'grace', 'zuri', 'kamau']);

  const aboveThirty = await request(app).get('/api/profiles/search?q=females%20above%2030');
  assert.equal(aboveThirty.status, 200);
  assert.deepEqual(aboveThirty.body.data.map((profile) => profile.name), ['ella', 'ada', 'grace']);

  const angola = await request(app).get('/api/profiles/search?q=people%20from%20angola');
  assert.equal(angola.status, 200);
  assert.deepEqual(angola.body.data.map((profile) => profile.name), ['zuri']);

  const kenya = await request(app).get('/api/profiles/search?q=adult%20males%20from%20kenya');
  assert.equal(kenya.status, 200);
  assert.deepEqual(kenya.body.data.map((profile) => profile.name), ['kamau']);
});

test('GET /api/profiles/search applies inclusive between-age ranges', async () => {
  const { app } = newApp({
    zara: { gender: 'female', gender_probability: 0.92, sample_size: 1000, age: 50, country_id: 'TZ', country_probability: 0.9 },
    zena: { gender: 'female', gender_probability: 0.91, sample_size: 1000, age: 54, country_id: 'TZ', country_probability: 0.9 },
    zola: { gender: 'female', gender_probability: 0.91, sample_size: 1000, age: 55, country_id: 'TZ', country_probability: 0.9 },
    zuri: { gender: 'female', gender_probability: 0.91, sample_size: 1000, age: 49, country_id: 'TZ', country_probability: 0.9 },
    zed: { gender: 'male', gender_probability: 0.91, sample_size: 1000, age: 52, country_id: 'TZ', country_probability: 0.9 },
  });
  await seedNames(app, ['zara', 'zena', 'zola', 'zuri', 'zed']);

  const res = await request(app).get(
    '/api/profiles/search?q=women%20from%20tanzania%20between%20the%20ages%20of%2050%20and%2054%20inclusive'
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((profile) => profile.name), ['zara', 'zena']);
});

test('GET /api/profiles/search applies OR clauses for multiple demographic segments', async () => {
  const { app } = newApp({
    akil: { gender: 'male', gender_probability: 0.94, sample_size: 1000, age: 40, country_id: 'AO', country_probability: 0.9 },
    abel: { gender: 'male', gender_probability: 0.94, sample_size: 1000, age: 66, country_id: 'AO', country_probability: 0.9 },
    amos: { gender: 'male', gender_probability: 0.94, sample_size: 1000, age: 67, country_id: 'AO', country_probability: 0.9 },
    afia: { gender: 'female', gender_probability: 0.94, sample_size: 1000, age: 50, country_id: 'AO', country_probability: 0.9 },
    gigi: { gender: 'female', gender_probability: 0.94, sample_size: 1000, age: 35, country_id: 'GH', country_probability: 0.9 },
    gala: { gender: 'female', gender_probability: 0.94, sample_size: 1000, age: 36, country_id: 'GH', country_probability: 0.9 },
    kwesi: { gender: 'male', gender_probability: 0.94, sample_size: 1000, age: 30, country_id: 'GH', country_probability: 0.9 },
  });
  await seedNames(app, ['akil', 'abel', 'amos', 'afia', 'gigi', 'gala', 'kwesi']);

  const res = await request(app).get(
    '/api/profiles/search?q=40%2B%20men%20from%20angola%20that%20are%20not%20up%20to%2067%20years%20old%20and%20women%20from%20ghana%20that%20are%20younger%20than%2036%20years'
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((profile) => profile.name), ['akil', 'abel', 'gigi']);
});

test('GET /api/profiles/search applies repeated countries and probability thresholds', async () => {
  const { app } = newApp({
    akil: { gender: 'male', gender_probability: 0.94, sample_size: 1000, age: 40, country_id: 'AO', country_probability: 0.9 },
    kwesi: { gender: 'male', gender_probability: 0.93, sample_size: 1000, age: 30, country_id: 'GH', country_probability: 0.85 },
    kofi: { gender: 'male', gender_probability: 0.89, sample_size: 1000, age: 30, country_id: 'GH', country_probability: 0.85 },
    amos: { gender: 'male', gender_probability: 0.94, sample_size: 1000, age: 30, country_id: 'AO', country_probability: 0.79 },
    afia: { gender: 'female', gender_probability: 0.94, sample_size: 1000, age: 30, country_id: 'GH', country_probability: 0.9 },
  });
  await seedNames(app, ['akil', 'kwesi', 'kofi', 'amos', 'afia']);

  const res = await request(app).get(
    '/api/profiles/search?q=men%20from%20angola%20and%20ghana%20with%20gender%20probability%20at%20least%2090%20percent%20and%20country%20confidence%20at%20least%2080%20percent'
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((profile) => profile.name), ['akil', 'kwesi']);
});

test('GET /api/profiles/search applies every flat NLS field together', async () => {
  const { app } = newApp({
    nala: { gender: 'female', gender_probability: 0.82, sample_size: 1000, age: 35, country_id: 'KE', country_probability: 0.75 },
    nina: { gender: 'female', gender_probability: 0.82, sample_size: 1000, age: 29, country_id: 'KE', country_probability: 0.75 },
    noor: { gender: 'female', gender_probability: 0.82, sample_size: 1000, age: 46, country_id: 'KE', country_probability: 0.75 },
    nate: { gender: 'male', gender_probability: 0.82, sample_size: 1000, age: 35, country_id: 'KE', country_probability: 0.75 },
    niya: { gender: 'female', gender_probability: 0.82, sample_size: 1000, age: 35, country_id: 'NG', country_probability: 0.75 },
    neha: { gender: 'female', gender_probability: 0.79, sample_size: 1000, age: 35, country_id: 'KE', country_probability: 0.75 },
    nera: { gender: 'female', gender_probability: 0.82, sample_size: 1000, age: 35, country_id: 'KE', country_probability: 0.69 },
  });
  await seedNames(app, ['nala', 'nina', 'noor', 'nate', 'niya', 'neha', 'nera']);

  const res = await request(app).get(
    '/api/profiles/search?q=adult%20women%20from%20kenya%20at%20least%2030%20years%20old%20not%20older%20than%2045%20with%20gender%20confidence%20is%20at%20least%2080%20percent%20and%20country%20probability%2070%20percent%20or%20above%20highest%20gender%20confidence'
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((profile) => profile.name), ['nala']);
});

test('GET /api/profiles/search omits gender when both genders are mentioned', async () => {
  const { app } = newApp(SEARCH_FIXTURES);
  await seedNames(app, ['ayo', 'zuri', 'teen', 'liam']);

  const res = await request(app).get('/api/profiles/search?q=male%20and%20female%20teenagers%20above%2017');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((profile) => profile.name), ['ayo', 'zuri']);
});

test('GET /api/profiles/search distinguishes invalid parameters from uninterpretable text', async () => {
  const { app } = newApp();

  const uninterpretable = await request(app).get('/api/profiles/search?q=clouds%20and%20dreams');
  assert.equal(uninterpretable.status, 400);
  assert.deepEqual(uninterpretable.body, { status: 'error', message: 'Unable to interpret query' });

  const empty = await request(app).get('/api/profiles/search?q=');
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.body, { status: 'error', message: 'Invalid query parameters' });

  const invalidPage = await request(app).get('/api/profiles/search?q=young%20males&page=0');
  assert.equal(invalidPage.status, 422);
  assert.deepEqual(invalidPage.body, { status: 'error', message: 'Invalid query parameters' });
});

test('DELETE existing profiles still returns 204 and preserves 404 after removal', async () => {
  const { app } = newApp();
  const created = await request(app).post('/api/profiles').send({ name: 'ella' });

  const del = await request(app).delete(`/api/profiles/${created.body.data.id}`);
  assert.equal(del.status, 204);
  assert.equal(del.headers['access-control-allow-origin'], '*');
  assert.equal(del.text, '');

  const missing = await request(app).get(`/api/profiles/${created.body.data.id}`);
  assert.equal(missing.status, 404);
});

test('DELETE keeps 404 behavior for malformed and missing ids', async () => {
  const { app } = newApp();

  const malformed = await request(app).delete('/api/profiles/bad-uuid');
  assert.equal(malformed.status, 404);

  const missing = await request(app).delete('/api/profiles/01860000-0000-7000-8000-000000000000');
  assert.equal(missing.status, 404);
});

test('CORS headers remain present on preflight and error responses', async () => {
  const { app } = newApp();

  const preflight = await request(app).options('/api/profiles');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], '*');
  assert.match(preflight.headers['access-control-allow-methods'], /POST/);

  const errorRes = await request(app).post('/api/profiles').send({});
  assert.equal(errorRes.status, 400);
  assert.equal(errorRes.headers['access-control-allow-origin'], '*');
});

test('age group classification boundaries stay unchanged', () => {
  const { ageGroup } = require('../src/services/classify');
  assert.equal(ageGroup(0), 'child');
  assert.equal(ageGroup(12), 'child');
  assert.equal(ageGroup(13), 'teenager');
  assert.equal(ageGroup(19), 'teenager');
  assert.equal(ageGroup(20), 'adult');
  assert.equal(ageGroup(59), 'adult');
  assert.equal(ageGroup(60), 'senior');
  assert.equal(ageGroup(120), 'senior');
});

test('top-probability country selection still prefers the largest probability', () => {
  const { pickTopCountry } = require('../src/services/classify');
  const top = pickTopCountry([
    { country_id: 'US', probability: 0.3 },
    { country_id: 'NG', probability: 0.6 },
    { country_id: 'GB', probability: 0.1 },
  ]);
  assert.equal(top.country_id, 'NG');
  assert.equal(pickTopCountry([]), null);
});
