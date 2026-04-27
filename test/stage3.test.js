const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createAuthService } = require('../src/services/auth');
const { createFakeEnrich } = require('./helpers/fakeEnrich');
const { createMemoryAuthRepo } = require('./helpers/memoryAuthRepo');
const { createMemoryRepo } = require('./helpers/memoryRepo');

async function stage3App({ apiRateLimit = 60, authRateLimit = 10 } = {}) {
  const authRepo = createMemoryAuthRepo();
  const repo = createMemoryRepo();
  const authService = createAuthService({
    repo: authRepo,
    jwtSecret: 'test-secret',
    adminGithubUsernames: 'admin',
  });
  const admin = await authRepo.upsertGithubUser({ github_id: '1', username: 'admin' }, 'admin');
  const analyst = await authRepo.upsertGithubUser({ github_id: '2', username: 'analyst' }, 'analyst');
  const adminTokens = await authService.issueTokenPair(admin);
  const analystTokens = await authService.issueTokenPair(analyst);
  const app = createApp({
    apiRateLimit,
    authRateLimit,
    authRepo,
    authService,
    enrichName: createFakeEnrich(),
    logger: () => {},
    repo,
  });
  return { adminTokens, analystTokens, app, authRepo, authService, repo };
}

function api(req, token) {
  return req.set('Authorization', `Bearer ${token}`).set('X-API-Version', '1');
}

test('API endpoints require X-API-Version and bearer auth', async () => {
  const { app, analystTokens } = await stage3App();

  const missingVersion = await request(app)
    .get('/api/profiles')
    .set('Authorization', `Bearer ${analystTokens.access_token}`);
  assert.equal(missingVersion.status, 400);
  assert.deepEqual(missingVersion.body, { status: 'error', message: 'API version header required' });

  const missingAuth = await request(app)
    .get('/api/profiles')
    .set('X-API-Version', '1');
  assert.equal(missingAuth.status, 401);
});

test('admin can create profiles, analyst is read-only', async () => {
  const { adminTokens, analystTokens, app } = await stage3App();

  const adminCreate = await api(request(app).post('/api/profiles'), adminTokens.access_token)
    .send({ name: 'ella' });
  assert.equal(adminCreate.status, 201);

  const analystCreate = await api(request(app).post('/api/profiles'), analystTokens.access_token)
    .send({ name: 'sarah' });
  assert.equal(analystCreate.status, 403);

  const analystList = await api(request(app).get('/api/profiles'), analystTokens.access_token);
  assert.equal(analystList.status, 200);
  assert.equal(analystList.body.total, 1);
});

test('analyst DELETE returns 403 and admin DELETE returns 204', async () => {
  const { adminTokens, analystTokens, app } = await stage3App();

  const created = await api(request(app).post('/api/profiles'), adminTokens.access_token)
    .send({ name: 'ella' });
  assert.equal(created.status, 201);
  const profileId = created.body.data.id;

  const analystDelete = await api(
    request(app).delete(`/api/profiles/${profileId}`),
    analystTokens.access_token
  );
  assert.equal(analystDelete.status, 403);

  const stillThere = await api(
    request(app).get(`/api/profiles/${profileId}`),
    analystTokens.access_token
  );
  assert.equal(stillThere.status, 200);

  const adminDelete = await api(
    request(app).delete(`/api/profiles/${profileId}`),
    adminTokens.access_token
  );
  assert.equal(adminDelete.status, 204);

  const gone = await api(
    request(app).get(`/api/profiles/${profileId}`),
    analystTokens.access_token
  );
  assert.equal(gone.status, 404);
});

test('inactive user receives 403 on authenticated requests and refresh', async () => {
  const { analystTokens, app, authRepo } = await stage3App();

  const [user] = [...authRepo._users.values()].filter((u) => u.username === 'analyst');
  user.is_active = false;

  const apiHit = await api(
    request(app).get('/api/profiles'),
    analystTokens.access_token
  );
  assert.equal(apiHit.status, 403);
  assert.deepEqual(apiHit.body, { status: 'error', message: 'User is inactive' });

  const refresh = await request(app)
    .post('/auth/refresh')
    .send({ refresh_token: analystTokens.refresh_token });
  assert.equal(refresh.status, 403);
  assert.deepEqual(refresh.body, { status: 'error', message: 'User is inactive' });
});

test('Stage 3 pagination shape includes total_pages and navigation links', async () => {
  const { adminTokens, analystTokens, app } = await stage3App();
  for (const name of ['ella', 'sarah', 'grace']) {
    const res = await api(request(app).post('/api/profiles'), adminTokens.access_token).send({ name });
    assert.equal(res.status, 201);
  }

  const res = await api(request(app).get('/api/profiles?page=1&limit=2'), analystTokens.access_token);
  assert.equal(res.status, 200);
  assert.equal(res.body.total_pages, 2);
  assert.equal(res.body.links.self, '/api/profiles?page=1&limit=2');
  assert.equal(res.body.links.next, '/api/profiles?page=2&limit=2');
  assert.equal(res.body.links.prev, null);
});

test('CSV export applies filters and emits required profile columns', async () => {
  const { adminTokens, analystTokens, app } = await stage3App();
  for (const name of ['ella', 'emmanuel']) {
    const res = await api(request(app).post('/api/profiles'), adminTokens.access_token).send({ name });
    assert.equal(res.status, 201);
  }

  const res = await api(
    request(app).get('/api/profiles/export?format=csv&gender=female'),
    analystTokens.access_token
  );
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment; filename="profiles_/);
  const lines = res.text.trim().split('\n');
  assert.equal(lines[0], 'id,name,gender,gender_probability,age,age_group,country_id,country_name,country_probability,created_at');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /ella/);
});

test('refresh tokens rotate and cannot be reused', async () => {
  const { analystTokens, app } = await stage3App();

  const refreshed = await request(app)
    .post('/auth/refresh')
    .send({ refresh_token: analystTokens.refresh_token });
  assert.equal(refreshed.status, 200);
  assert.deepEqual(Object.keys(refreshed.body).sort(), ['access_token', 'refresh_token', 'status']);
  assert.equal(refreshed.body.status, 'success');
  assert.ok(refreshed.body.access_token);
  assert.ok(refreshed.body.refresh_token);
  assert.notEqual(refreshed.body.refresh_token, analystTokens.refresh_token);

  const reused = await request(app)
    .post('/auth/refresh')
    .send({ refresh_token: analystTokens.refresh_token });
  assert.equal(reused.status, 401);
});

test('CLI OAuth exchange upserts GitHub user and applies admin allowlist', async () => {
  const authRepo = createMemoryAuthRepo();
  const repo = createMemoryRepo();
  const githubProvider = {
    async exchangeCode({ client, code, codeVerifier, redirectUri }) {
      assert.equal(client, 'cli');
      assert.equal(code, 'oauth-code');
      assert.equal(codeVerifier.length >= 43, true);
      assert.equal(redirectUri, 'http://127.0.0.1:49152/callback');
      return {
        github_id: '42',
        username: 'allowed-admin',
        email: 'admin@example.com',
        avatar_url: 'https://example.com/avatar.png',
      };
    },
  };
  const app = createApp({
    authRepo,
    githubProvider,
    jwtSecret: 'test-secret',
    adminGithubUsernames: 'allowed-admin',
    logger: () => {},
    repo,
  });

  const res = await request(app)
    .post('/auth/github/cli')
    .send({
      code: 'oauth-code',
      code_verifier: 'a'.repeat(50),
      redirect_uri: 'http://127.0.0.1:49152/callback',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, 'allowed-admin');
  assert.equal(res.body.user.role, 'admin');
  assert.ok(res.body.access_token);
  assert.ok(res.body.refresh_token);
});

test('API rate limiting returns 429 after the configured per-user limit', async () => {
  const { analystTokens, app } = await stage3App({ apiRateLimit: 2 });

  const first = await api(request(app).get('/api/profiles'), analystTokens.access_token);
  const second = await api(request(app).get('/api/profiles'), analystTokens.access_token);
  const third = await api(request(app).get('/api/profiles'), analystTokens.access_token);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.deepEqual(third.body, { status: 'error', message: 'Too many requests' });
});

test('request logging records method, endpoint, status, and response time', async () => {
  const logs = [];
  const app = createApp({
    authRequired: false,
    apiVersionRequired: false,
    logger: (line) => logs.push(line),
    repo: createMemoryRepo(),
  });

  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[request\] GET \/ 200 \d+\.\dms/);
});
