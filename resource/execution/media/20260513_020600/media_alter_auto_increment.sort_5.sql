CREATE TABLE video_minio_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `video_id` integer NOT NULL,
    `type` integer NOT NULL,
    `origin_uri` text NOT NULL,
    `link` text NOT NULL,
    `title` text DEFAULT NULL,
    `status` integer NOT NULL,
    `sort` integer NOT NULL DEFAULT 0,
    `object_size` text DEFAULT NULL
);

INSERT INTO
    video_minio_new (
        `id`,
        `video_id`,
        `type`,
        `origin_uri`,
        `link`,
        `title`,
        `status`,
        `sort`,
        `object_size`
    )
SELECT
    `id`,
    `video_id`,
    `type`,
    `origin_uri`,
    `link`,
    `title`,
    `status`,
    `sort`,
    `object_size`
FROM video_minio;

DROP TABLE video_minio;

ALTER TABLE video_minio_new RENAME TO video_minio;

CREATE UNIQUE INDEX idx_video_type1_unique ON video_minio(`video_id`) WHERE type = 1;