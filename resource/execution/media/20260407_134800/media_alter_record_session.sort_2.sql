DROP TABLE bilive_record_session;

CREATE TABLE bilive_record_session (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `session_id` text NOT NULL,
    `stream_id` integer NOT NULL,
    `room_id` integer NOT NULL,
    `start_time` datetime DEFAULT NULL,
    `end_time` datetime DEFAULT NULL,
    `status` integer DEFAULT 0,
    CONSTRAINT `idx_unique_session_id` UNIQUE (`session_id`)
);

CREATE INDEX `idx_session_stream_id` ON bilive_record_session (`stream_id`);

CREATE INDEX `idx_session_room_id` ON bilive_record_session (`room_id`);