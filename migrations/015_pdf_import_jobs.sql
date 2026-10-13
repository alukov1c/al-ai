CREATE TABLE pdf_import_jobs (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 file_id uuid REFERENCES user_files(id) ON DELETE SET NULL,
 scope text NOT NULL,
 fingerprint text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','complete','failed')),
 stage text NOT NULL DEFAULT 'Sačuvano; čeka obradu',
 started_at timestamptz,
 result jsonb,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,scope,fingerprint)
);
