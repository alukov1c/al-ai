ALTER TABLE conversations ADD COLUMN sort_order bigint NOT NULL DEFAULT 0;
WITH ranks AS (SELECT id,row_number() OVER(PARTITION BY user_id ORDER BY updated_at DESC,id) AS position FROM conversations)
UPDATE conversations SET sort_order=ranks.position FROM ranks WHERE ranks.id=conversations.id;