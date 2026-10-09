ALTER TABLE messages ADD COLUMN generation_ms integer CHECK (generation_ms >= 0);
