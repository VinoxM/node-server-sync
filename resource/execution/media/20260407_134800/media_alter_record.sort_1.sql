DROP TABLE bilive_record;

CREATE TABLE bilive_record (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `event` integer NOT NULL,
    `session_id` text DEFAULT NULL,
    `room_id` integer NOT NULL,
    `event_timestamp` datetime NOT NULL,
    `event_id` text NOT NULL,
    `event_data` text NOT NULL,
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_session_id` ON bilive_record (`session_id`);