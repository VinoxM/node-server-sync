CREATE TABLE aria2_task_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `minio_id` integer NOT NULL,
    `gid` varchar(100) NOT NULL,
    `file_path` varchar(500) DEFAULT NULL,
    `file_num` integer DEFAULT NULL,
    `status` integer NOT NULL,
    CONSTRAINT `idx_unique_gid` UNIQUE (`gid`)
);

INSERT INTO
    aria2_task_new (
        `id`,
        `minio_id`,
        `gid`,
        `file_path`,
        `file_num`,
        `status`
    )
SELECT
    `id`,
    `minio_id`,
    `gid`,
    `file_path`,
    `file_num`,
    `status`
FROM aria2_task;

DROP TABLE aria2_task;

ALTER TABLE aria2_task_new RENAME TO aria2_task;