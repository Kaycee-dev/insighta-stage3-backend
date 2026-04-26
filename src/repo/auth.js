const { uuidv7 } = require('uuidv7');
const { query } = require('../db');

function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    github_id: row.github_id,
    username: row.username,
    email: row.email,
    avatar_url: row.avatar_url,
    role: row.role,
    is_active: Boolean(row.is_active),
    last_login_at: row.last_login_at ? new Date(row.last_login_at).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
  };
}

async function upsertGithubUser(profile, desiredRole = 'analyst') {
  const { rows } = await query(
    `
      INSERT INTO users
        (id, github_id, username, email, avatar_url, role, last_login_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, now() AT TIME ZONE 'UTC')
      ON CONFLICT (github_id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        avatar_url = EXCLUDED.avatar_url,
        role = CASE
          WHEN users.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
          ELSE users.role
        END,
        last_login_at = now() AT TIME ZONE 'UTC',
        updated_at = now() AT TIME ZONE 'UTC'
      RETURNING
        id, github_id, username, email, avatar_url, role, is_active,
        last_login_at AT TIME ZONE 'UTC' AS last_login_at,
        created_at AT TIME ZONE 'UTC' AS created_at
    `,
    [
      uuidv7(),
      String(profile.github_id),
      profile.username,
      profile.email || null,
      profile.avatar_url || null,
      desiredRole,
    ]
  );
  return serializeUser(rows[0]);
}

async function findUserById(id) {
  const { rows } = await query(
    `
      SELECT
        id, github_id, username, email, avatar_url, role, is_active,
        last_login_at AT TIME ZONE 'UTC' AS last_login_at,
        created_at AT TIME ZONE 'UTC' AS created_at
      FROM users
      WHERE id = $1
    `,
    [id]
  );
  return serializeUser(rows[0]);
}

async function createRefreshToken({ userId, tokenHash, expiresAt }) {
  await query(
    `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [uuidv7(), userId, tokenHash, expiresAt]
  );
}

async function consumeRefreshToken(tokenHash) {
  const { rows } = await query(
    `
      UPDATE refresh_tokens
      SET revoked_at = now() AT TIME ZONE 'UTC',
          last_used_at = now() AT TIME ZONE 'UTC'
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > (now() AT TIME ZONE 'UTC')
      RETURNING user_id
    `,
    [tokenHash]
  );
  if (!rows[0]) return null;
  return findUserById(rows[0].user_id);
}

async function revokeRefreshToken(tokenHash) {
  const { rowCount } = await query(
    `
      UPDATE refresh_tokens
      SET revoked_at = COALESCE(revoked_at, now() AT TIME ZONE 'UTC')
      WHERE token_hash = $1
    `,
    [tokenHash]
  );
  return rowCount > 0;
}

async function createWebAuthCode({ userId, codeHash, expiresAt }) {
  await query(
    `
      INSERT INTO web_auth_codes (id, code_hash, user_id, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [uuidv7(), codeHash, userId, expiresAt]
  );
}

async function consumeWebAuthCode(codeHash) {
  const { rows } = await query(
    `
      UPDATE web_auth_codes
      SET used_at = now() AT TIME ZONE 'UTC'
      WHERE code_hash = $1
        AND used_at IS NULL
        AND expires_at > (now() AT TIME ZONE 'UTC')
      RETURNING user_id
    `,
    [codeHash]
  );
  if (!rows[0]) return null;
  return findUserById(rows[0].user_id);
}

module.exports = {
  consumeRefreshToken,
  consumeWebAuthCode,
  createRefreshToken,
  createWebAuthCode,
  findUserById,
  revokeRefreshToken,
  upsertGithubUser,
};
