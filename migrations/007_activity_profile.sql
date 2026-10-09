ALTER TABLE users ADD COLUMN profile_memories jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE user_activity (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,day date NOT NULL,messages integer NOT NULL DEFAULT 0 CHECK(messages>=0),PRIMARY KEY(user_id,day));
INSERT INTO user_activity(user_id,day,messages)
SELECT c.user_id,(m.created_at AT TIME ZONE 'Europe/Belgrade')::date,count(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
WHERE m.role='user' AND c.import_key IS NULL GROUP BY c.user_id,(m.created_at AT TIME ZONE 'Europe/Belgrade')::date;
