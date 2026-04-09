DROP INDEX IF EXISTS `idx_session_stream_id`;

DROP INDEX IF EXISTS `idx_session_room_id`;

CREATE INDEX `idx_br_session_stream_id` ON bilive_record_session (`stream_id`);

CREATE INDEX `idx_br_session_room_id` ON bilive_record_session (`room_id`);