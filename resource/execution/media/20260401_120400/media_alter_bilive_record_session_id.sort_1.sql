CREATE TABLE bilive_record_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `event` integer NOT NULL,
    `session_id` text DEFAULT NULL,
    `room_id` integer NOT NULL,
    `short_id` integer NOT NULL DEFAULT 0,
    `event_timestamp` datetime NOT NULL,
    `event_id` text NOT NULL,
    `event_data` text NOT NULL,
    `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bilive_record_new (id, event, session_id, room_id, short_id, event_timestamp, event_id, event_data, create_time)
SELECT id, event, session_id, room_id, short_id, event_timestamp, event_id, event_data, create_time FROM bilive_record;

DROP TABLE bilive_record;

ALTER TABLE bilive_record_new RENAME TO bilive_record;