ALTER TABLE projects ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN archived boolean NOT NULL DEFAULT false;