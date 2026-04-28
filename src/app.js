const express = require('express');
const { createRouter } = require('./routes/profiles');
const defaultAuthRepo = require('./repo/auth');
const { createAuthRouter } = require('./routes/auth');
const { createUsersRouter } = require('./routes/users');
const { error } = require('./lib/respond');
const { HttpError } = require('./lib/errors');
const { createAuthService } = require('./services/auth');
const { requireApiVersion } = require('./middleware/apiVersion');
const { requireAuth } = require('./middleware/auth');
const { requestLogger } = require('./middleware/requestLogger');
const { memoryStore, rateLimit } = require('./middleware/rateLimit');

function cors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Version, X-CSRF-Token');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}

function createApp(options = {}) {
  const app = express();
  const authService = options.authService || createAuthService({
    repo: options.authRepo || defaultAuthRepo,
    githubProvider: options.githubProvider,
    jwtSecret: options.jwtSecret,
    adminGithubIds: options.adminGithubIds,
    adminGithubUsernames: options.adminGithubUsernames,
    backendPublicUrl: options.backendPublicUrl,
    webAppUrl: options.webAppUrl,
  });
  const store = options.rateLimitStore || memoryStore();
  const authRequired = options.authRequired !== false;
  const apiVersionRequired = options.apiVersionRequired !== false;

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors);
  app.use(requestLogger(options.logger || console.log));
  app.use(express.json({ limit: '10kb' }));

  app.get('/', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Insighta Labs+ Stage 3 API' });
  });

  app.use('/auth', rateLimit({
    key: (req) => req.ip || req.socket.remoteAddress || 'anonymous',
    limit: options.authRateLimit || 10,
    scope: 'auth',
    store,
    windowMs: 60_000,
  }), createAuthRouter({ authService }));

  if (apiVersionRequired) {
    app.use('/api', requireApiVersion);
  }
  if (authRequired) {
    app.use('/api', requireAuth(authService));
    app.use('/api', rateLimit({
      key: (req) => req.user ? req.user.id : (req.ip || 'anonymous'),
      limit: options.apiRateLimit || 60,
      scope: 'api',
      store,
      windowMs: 60_000,
    }));
  }
  app.use('/api/profiles', createRouter(options));
  app.use('/api/users', createUsersRouter());

  app.use((req, res) => {
    error(res, 404, 'Profile not found');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return error(res, 400, 'Missing or empty name');
    }
    if (err instanceof HttpError) {
      return error(res, err.status, err.message);
    }
    console.error('[unhandled]', err);
    return error(res, 500, 'Internal server error');
  });

  return app;
}

module.exports = { createApp };
