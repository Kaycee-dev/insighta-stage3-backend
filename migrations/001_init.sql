CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID PRIMARY KEY,
  name                 TEXT NOT NULL,
  name_key             TEXT NOT NULL UNIQUE,
  gender               TEXT NOT NULL,
  gender_probability   NUMERIC(4,3) NOT NULL,
  sample_size          INTEGER NOT NULL,
  age                  INTEGER NOT NULL,
  age_group            TEXT NOT NULL,
  country_id           TEXT NOT NULL,
  country_probability  NUMERIC(4,3) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_gender_idx    ON profiles (gender);
CREATE INDEX IF NOT EXISTS profiles_country_idx   ON profiles (country_id);
CREATE INDEX IF NOT EXISTS profiles_age_group_idx ON profiles (age_group);
