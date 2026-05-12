CREATE TABLE rss_episode_subtitle_new (
    `id` integer PRIMARY KEY NOT NULL,
    `rss_task_id` integer NOT NULL,
    `rss_subs_id` integer NOT NULL,
    `title` text DEFAULT NULL,
    `episode` varchar(10) DEFAULT NULL,
    `minio_link` varchar(500) DEFAULT NULL,
    `root_path` varchar(500) NOT NULL,
    `file_name` varchar(500) NOT NULL,
    `fonts` text DEFAULT NULL,
    `status` integer NOT NULL,
    `file_status` integer NOT NULL,
    `object_size` text DEFAULT NULL
);

INSERT INTO
    rss_episode_subtitle_new (
        `id`,
        `rss_task_id`,
        `rss_subs_id`,
        `title`,
        `episode`,
        `minio_link`,
        `root_path`,
        `file_name`,
        `fonts`,
        `status`,
        `file_status`
    )
SELECT
    `id`,
    `rss_task_id`,
    `rss_subs_id`,
    `title`,
    `episode`,
    `minio_link`,
    `root_path`,
    `file_name`,
    `fonts`,
    `status`,
    `file_status`
FROM rss_episode_subtitle;

DROP TABLE rss_episode_subtitle;

ALTER TABLE rss_episode_subtitle_new RENAME TO rss_episode_subtitle;

CREATE INDEX `idx_rss_ep_st_subs_id` ON rss_episode_subtitle (`rss_subs_id`);

CREATE INDEX `idx_rss_ep_st_task_id` ON rss_episode_subtitle (`rss_task_id`);

CREATE INDEX `idx_rss_ep_st_object_size` ON rss_episode_subtitle (`object_size`);