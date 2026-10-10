ALTER TABLE messages ADD COLUMN transfer_source_conversation_id uuid;
ALTER TABLE messages ADD COLUMN transfer_source_message_id bigint;
ALTER TABLE messages ADD COLUMN transferred_total_tokens bigint;
ALTER TABLE messages ADD COLUMN transferred_work_file_id uuid REFERENCES user_files(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX messages_transfer_once ON messages(conversation_id,transfer_source_conversation_id,transfer_source_message_id) WHERE transfer_source_message_id IS NOT NULL;
