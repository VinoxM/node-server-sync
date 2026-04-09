CREATE TABLE bilive_record_stream_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `room_id` integer NOT NULL,
    `host_name` text DEFAULT NULL,
    `title` text DEFAULT NULL,
    `area_name_parent` text DEFAULT NULL,
    `area_name_child` text DEFAULT NULL,
    `start_time` datetime DEFAULT NULL,
    `end_time` datetime DEFAULT NULL,
    `streaming` integer DEFAULT 1,
    `end_reason` text DEFAULT NULL,
    `end_by_record_id` integer DEFAULT NULL,
    `video_id` integer DEFAULT NULL
);

INSERT INTO
    bilive_record_stream_new (
        `id`,
        room_id,
        host_name,
        title,
        area_name_parent,
        area_name_child,
        start_time,
        end_time,
        streaming,
        end_reason,
        end_by_record_id
    )
SELECT
    `id`,
    room_id,
    host_name,
    title,
    area_name_parent,
    area_name_child,
    start_time,
    end_time,
    streaming,
    end_reason,
    end_by_record_id
FROM bilive_record_stream;

DROP TABLE bilive_record_stream;

ALTER TABLE bilive_record_stream_new RENAME TO bilive_record_stream;

CREATE INDEX `idx_br_stream_room_id` ON bilive_record_stream (`room_id`);

CREATE INDEX `idx_br_stream_host_name` ON bilive_record_stream (`host_name`);

CREATE INDEX `idx_br_stream_title` ON bilive_record_stream (`title`);