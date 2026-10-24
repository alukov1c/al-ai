ALTER TABLE users ALTER COLUMN internet_enabled SET DEFAULT true;
ALTER TABLE users ADD COLUMN internet_preference_set boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN internet_filter_enabled boolean NOT NULL DEFAULT true;
