ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country_name VARCHAR NOT NULL DEFAULT '';

UPDATE profiles
SET
  name = BTRIM(name),
  gender = LOWER(BTRIM(gender)),
  age_group = LOWER(BTRIM(age_group)),
  country_id = UPPER(BTRIM(country_id));

ALTER TABLE profiles
  DROP COLUMN IF EXISTS name_key,
  DROP COLUMN IF EXISTS sample_size;

ALTER TABLE profiles
  ALTER COLUMN id TYPE UUID,
  ALTER COLUMN name TYPE VARCHAR,
  ALTER COLUMN gender TYPE VARCHAR,
  ALTER COLUMN gender_probability TYPE DOUBLE PRECISION USING gender_probability::double precision,
  ALTER COLUMN age TYPE INTEGER USING age::integer,
  ALTER COLUMN age_group TYPE VARCHAR,
  ALTER COLUMN country_id TYPE VARCHAR(2),
  ALTER COLUMN country_name TYPE VARCHAR,
  ALTER COLUMN country_probability TYPE DOUBLE PRECISION USING country_probability::double precision,
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC';

DROP INDEX IF EXISTS profiles_gender_idx;
DROP INDEX IF EXISTS profiles_country_idx;
DROP INDEX IF EXISTS profiles_age_group_idx;
DROP INDEX IF EXISTS profiles_name_normalized_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_name_normalized_uidx
  ON profiles ((LOWER(BTRIM(name))));

CREATE INDEX IF NOT EXISTS profiles_gender_idx
  ON profiles (gender);

CREATE INDEX IF NOT EXISTS profiles_age_group_idx
  ON profiles (age_group);

CREATE INDEX IF NOT EXISTS profiles_country_id_idx
  ON profiles (country_id);

CREATE INDEX IF NOT EXISTS profiles_age_idx
  ON profiles (age);

CREATE INDEX IF NOT EXISTS profiles_gender_probability_idx
  ON profiles (gender_probability);

CREATE INDEX IF NOT EXISTS profiles_country_probability_idx
  ON profiles (country_probability);

CREATE INDEX IF NOT EXISTS profiles_created_at_idx
  ON profiles (created_at);

ALTER TABLE profiles
  ALTER COLUMN country_name DROP DEFAULT;

ALTER TABLE profiles
  ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
