const { error } = require('../lib/respond');

function readBearer(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function requireAuth(authService) {
  return async (req, res, next) => {
    try {
      const token = readBearer(req);
      if (!token) {
        return error(res, 401, 'Authentication required');
      }
      const user = await authService.authenticateAccessToken(token);
      if (!user) {
        return error(res, 401, 'Invalid or expired access token');
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 401, 'Authentication required');
    }
    if (!allowed.has(req.user.role)) {
      return error(res, 403, 'Forbidden');
    }
    next();
  };
}

module.exports = { readBearer, requireAuth, requireRole };
