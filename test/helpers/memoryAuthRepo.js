const { uuidv7 } = require('uuidv7');

function createMemoryAuthRepo() {
  const users = new Map();
  const usersByGithubId = new Map();
  const refreshTokens = new Map();
  const webCodes = new Map();

  function clone(value) {
    return value ? { ...value } : null;
  }

  return {
    _users: users,
    async upsertGithubUser(profile, desiredRole = 'analyst') {
      const githubId = String(profile.github_id);
      const existingId = usersByGithubId.get(githubId);
      if (existingId) {
        const existing = users.get(existingId);
        const updated = {
          ...existing,
          username: profile.username,
          email: profile.email || null,
          avatar_url: profile.avatar_url || null,
          role: existing.role === 'admin' || desiredRole === 'admin' ? 'admin' : existing.role,
          last_login_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        };
        users.set(existingId, updated);
        return clone(updated);
      }
      const user = {
        id: uuidv7(),
        github_id: githubId,
        username: profile.username,
        email: profile.email || null,
        avatar_url: profile.avatar_url || null,
        role: desiredRole,
        is_active: true,
        last_login_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      };
      users.set(user.id, user);
      usersByGithubId.set(githubId, user.id);
      return clone(user);
    },
    async findUserById(id) {
      return clone(users.get(id));
    },
    async createRefreshToken({ userId, tokenHash, expiresAt }) {
      refreshTokens.set(tokenHash, {
        user_id: userId,
        expires_at: expiresAt,
        revoked_at: null,
      });
    },
    async consumeRefreshToken(tokenHash) {
      const token = refreshTokens.get(tokenHash);
      if (!token || token.revoked_at || token.expires_at <= new Date()) return null;
      token.revoked_at = new Date();
      return clone(users.get(token.user_id));
    },
    async revokeRefreshToken(tokenHash) {
      const token = refreshTokens.get(tokenHash);
      if (!token) return false;
      token.revoked_at = new Date();
      return true;
    },
    async createWebAuthCode({ userId, codeHash, expiresAt }) {
      webCodes.set(codeHash, {
        user_id: userId,
        expires_at: expiresAt,
        used_at: null,
      });
    },
    async consumeWebAuthCode(codeHash) {
      const code = webCodes.get(codeHash);
      if (!code || code.used_at || code.expires_at <= new Date()) return null;
      code.used_at = new Date();
      return clone(users.get(code.user_id));
    },
  };
}

module.exports = { createMemoryAuthRepo };
