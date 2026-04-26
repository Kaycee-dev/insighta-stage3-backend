function success(res, status, payload) {
  return res.status(status).json({ status: 'success', ...payload });
}

function error(res, status, message) {
  return res.status(status).json({ status: 'error', message });
}

module.exports = { success, error };
