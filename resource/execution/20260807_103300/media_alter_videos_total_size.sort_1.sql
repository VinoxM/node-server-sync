ALTER TABLE videos RENAME TO videos_old;

CREATE TABLE videos (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `unique_id` varchar(100) NOT NULL,
    `title` varchar(500) NOT NULL,
    `category_id` integer NOT NULL,
    `author_id` integer NOT NULL,
    `cover_id` integer DEFAULT NULL,
    `upload_time` datetime NOT NULL,
    `status` integer NOT NULL,
    `create_time` datetime NOT NULL,
    `total_size` bigint DEFAULT NULL
);

INSERT INTO
    videos (
        `id`,
        `unique_id`,
        `title`,
        `category_id`,
        `author_id`,
        `cover_id`,
        `upload_time`,
        `status`,
        `create_time`,
        `total_size`
    )
SELECT
    `id`,
    `unique_id`,
    `title`,
    `category_id`,
    `author_id`,
    `cover_id`,
    `upload_time`,
    `status`,
    `create_time`,
    CAST(
        NULLIF(`total_size`, '') AS INTEGER
    )
FROM videos_old;

DROP TABLE videos_old;

CREATE INDEX `idx_video_unique` ON videos (`unique_id`);

CREATE INDEX `idx_video_category` ON videos (`category_id`);

CREATE INDEX `idx_video_author` ON videos (`author_id`);

CREATE INDEX `idx_video_upload_time` ON videos (`upload_time`);

CREATE INDEX `idx_video_total_size` ON videos (`total_size`);