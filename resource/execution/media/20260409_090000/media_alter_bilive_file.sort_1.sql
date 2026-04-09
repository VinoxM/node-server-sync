CREATE TABLE bilive_record_files_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `session_id` text NOT NULL,
    `stream_id` integer NOT NULL,
    `title` text NOT NULL,
    `file_path` text NOT NULL,
    `file_size` integer DEFAULT NULL,
    `start_time` datetime NOT NULL,
    `end_time` datetime DEFAULT NULL,
    `file_status` integer NOT NULL DEFAULT 0,
    `sync_status` integer NOT NULL DEFAULT 0
);

INSERT INTO
    bilive_record_files_new (
        `id`,
        session_id,
        stream_id,
        title,
        file_path,
        file_size,
        start_time,
        end_time,
        file_status
    )
SELECT
    id,
    session_id,
    stream_id,
    title,
    file_path,
    file_size,
    start_time,
    end_time,
    `status`
FROM bilive_record_files;

DROP TABLE bilive_record_files;

ALTER TABLE bilive_record_files_new RENAME TO bilive_record_files;

CREATE INDEX `idx_br_files_session_id` ON bilive_record_files (`session_id`);

CREATE INDEX `idx_br_files_record_stream_id` ON bilive_record_files (`stream_id`);

CREATE INDEX `idx_br_files_record_file_path` ON bilive_record_files (`file_path`);