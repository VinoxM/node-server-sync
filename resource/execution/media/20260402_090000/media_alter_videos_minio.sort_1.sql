CREATE TABLE video_minio_new (
    `id` integer PRIMARY KEY NOT NULL,
    `video_id` integer NOT NULL,
    `type` integer NOT NULL,
    `origin_uri` text NOT NULL,
    `link` text NOT NULL,
    `title` text DEFAULT NULL,
    `status` integer NOT NULL,
    `sort` integer NOT NULL DEFAULT 0
);

INSERT INTO video_minio_new (`id`, `video_id`, `type`, `origin_uri`, `link`, `status`, `sort`)
SELECT `id`, `video_id`, `type`, `origin_uri`, `link`, `status`, 0 FROM video_minio;

DROP TABLE video_minio;

ALTER TABLE video_minio_new RENAME TO video_minio;

CREATE UNIQUE INDEX idx_video_type1_unique ON video_minio (video_id) WHERE type = 1;

UPDATE video_minio SET `type`=-1 WHERE `type`=1;
UPDATE video_minio SET `type`=1 WHERE `type`=2;
UPDATE video_minio SET `type`=2 WHERE `type`=-1;

CREATE TABLE videos_new (
    `id` integer PRIMARY KEY NOT NULL,
    `unique_id` varchar(100) NOT NULL,
    `title` varchar(500) NOT NULL,
    `category_id` integer NOT NULL,
    `author_id` integer NOT NULL,
    `cover_id` integer DEFAULT NULL,
    `upload_time` datetime NOT NULL,
    `status` integer NOT NULL,
    `create_time` datetime NOT NULL
);

INSERT INTO videos_new (`id`, `unique_id`, `title`, `category_id`, `author_id`, `cover_id`, `upload_time`, `status`, `create_time`)
SELECT `id`, `unique_id`, `title`, `category_id`, `author_id`, `cover_id`, `upload_time`, `status`, `create_time` FROM videos;

DROP TABLE videos;

ALTER TABLE videos_new RENAME TO videos;

CREATE INDEX `idx_video_unique` ON videos(`unique_id`);
CREATE INDEX `idx_video_category` ON videos(`category_id`);
CREATE INDEX `idx_video_author` ON videos(`author_id`);
CREATE INDEX `idx_video_upload_time` ON videos(`upload_time`);