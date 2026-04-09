DROP INDEX IF EXISTS `idx_session_id`;

CREATE INDEX `idx_br_session_id` ON bilive_record (`session_id`);