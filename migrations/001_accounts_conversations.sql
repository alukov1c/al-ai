CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text,
  google_sub text UNIQUE,
  google_email text,
  approval_state text NOT NULL DEFAULT 'approved' CHECK (approval_state IN ('pending','approved')),
  is_admin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  model text NOT NULL DEFAULT 'deepseek-flash',
  import_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, import_key)
);
CREATE INDEX conversations_owner ON conversations(user_id, updated_at DESC, id);
CREATE TABLE messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation ON messages(conversation_id, id);
CREATE TABLE chat_requests (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  prompt text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  answer text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(conversation_id, request_id)
);
CREATE INDEX chat_requests_pending ON chat_requests(status, started_at);

CREATE TABLE google_challenges (
  token_hash text PRIMARY KEY,
  nonce_hash text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  session_hash text,
  expires_at timestamptz NOT NULL
);
CREATE INDEX google_challenges_expiry ON google_challenges(expires_at);
