const { error } = require('../lib/respond');

function requireApiVersion(req, res, next) {
  const version = req.get('X-API-Version');
  if (!version) {
    return error(res, 400, 'API version header required');
  }
  if (version !== '1') {
    return error(res, 400, 'Unsupported API version');
  }
  next();
}

module.exports = { requireApiVersion };
