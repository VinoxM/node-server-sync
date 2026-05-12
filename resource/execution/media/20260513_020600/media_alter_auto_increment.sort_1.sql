CREATE TABLE videos_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `unique_id` varchar(100) NOT NULL,
    `title` varchar(500) NOT NULL,
    `category_id` integer NOT NULL,
    `author_id` integer NOT NULL,
    `cover_id` integer DEFAULT NULL,
    `upload_time` datetime NOT NULL,
    `status` integer NOT NULL,
    `create_time` datetime NOT NULL
);

INSERT INTO
    videos_new (
        `id`,
        `unique_id`,
        `title`,
        `category_id`,
        `author_id`,
        `cover_id`,
        `upload_time`,
        `status`,
        `create_time`
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
    `create_time`
FROM videos;

DROP TABLE videos;

ALTER TABLE videos_new RENAME TO videos;

CREATE INDEX `idx_video_unique` ON videos (`unique_id`);

CREATE INDEX `idx_video_category` ON videos (`category_id`);

CREATE INDEX `idx_video_author` ON videos (`author_id`);

CREATE INDEX `idx_video_upload_time` ON videos (`upload_time`);