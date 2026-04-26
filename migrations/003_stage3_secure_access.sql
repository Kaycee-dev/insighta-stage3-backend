CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY,
  github_id       VARCHAR NOT NULL UNIQUE,
  username        VARCHAR NOT NULL,
  email           VARCHAR,
  avatar_url      VARCHAR,
  role            VARCHAR NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  updated_at      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS users_role_idx
  ON users (role);

CREATE INDEX IF NOT EXISTS users_is_active_idx
  ON users (is_active);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     VARCHAR NOT NULL UNIQUE,
  expires_at     TIMESTAMP NOT NULL,
  revoked_at     TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  last_used_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS refresh_tokens_active_idx
  ON refresh_tokens (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS web_auth_codes (
  id           UUID PRIMARY KEY,
  code_hash    VARCHAR NOT NULL UNIQUE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMP NOT NULL,
  used_at      TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS web_auth_codes_active_idx
  ON web_auth_codes (code_hash, expires_at)
  WHERE used_at IS NULL;
