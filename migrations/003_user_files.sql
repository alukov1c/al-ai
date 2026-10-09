CREATE TABLE user_files (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
 name text NOT NULL,
 mime text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('image','document')),
 direction text NOT NULL CHECK (direction IN ('import','export')),
 content bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_files_owner ON user_files(user_id,created_at DESC);
ALTER TABLE messages ADD COLUMN file_id uuid REFERENCES user_files(id) ON DELETE SET NULL;
ALTER TABLE chat_requests ADD COLUMN file_id uuid REFERENCES user_files(id) ON DELETE SET NULL;
