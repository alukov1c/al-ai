ALTER TABLE users ADD COLUMN personalization text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN memory_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN memory_entries jsonb NOT NULL DEFAULT '[]';
