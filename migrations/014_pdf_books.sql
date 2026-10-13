CREATE TABLE pdf_documents (
 file_id uuid PRIMARY KEY REFERENCES user_files(id) ON DELETE CASCADE,
 pages integer NOT NULL,
 readable_pages integer NOT NULL,
 characters integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pdf_chunks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 file_id uuid NOT NULL REFERENCES pdf_documents(file_id) ON DELETE CASCADE,
 page integer NOT NULL,
 position integer NOT NULL,
 content text NOT NULL,
 search tsvector NOT NULL,
 UNIQUE(file_id,position)
);
CREATE INDEX pdf_chunks_file ON pdf_chunks(file_id,position);
CREATE INDEX pdf_chunks_search ON pdf_chunks USING gin(search);
CREATE TABLE pdf_summary_jobs (
 id uuid PRIMARY KEY,
 file_id uuid NOT NULL REFERENCES pdf_documents(file_id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 model text NOT NULL,
 state jsonb NOT NULL,
 busy boolean NOT NULL DEFAULT false,
 started_at timestamptz,
 error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
