const express = require('express');
const { success } = require('../lib/respond');
const { publicUser } = require('../services/auth');

function createUsersRouter() {
  const router = express.Router();

  router.get('/me', (req, res) => {
    return success(res, 200, { data: publicUser(req.user) });
  });

  return router;
}

module.exports = { createUsersRouter };
