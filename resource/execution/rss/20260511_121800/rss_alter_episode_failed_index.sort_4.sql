CREATE TABLE rss_episode_failed_new (
    `id` integer PRIMARY KEY NOT NULL,
    `rss_task_id` integer NOT NULL,
    `rss_subs_id` integer NOT NULL,
    `episode` varchar(10) DEFAULT NULL,
    `minio_link` varchar(500) DEFAULT NULL,
    `root_path` varchar(500) NOT NULL,
    `file_name` varchar(500) NOT NULL,
    `reason` varchar(1) NOT NULL,
    `create_time` datetime NOT NULL
);

INSERT INTO
    rss_episode_failed_new (
        `id`,
        `rss_task_id`,
        `rss_subs_id`,
        `episode`,
        `minio_link`,
        `root_path`,
        `file_name`,
        `reason`,
        `create_time`
    )
SELECT
    `id`,
    `rss_task_id`,
    `rss_subs_id`,
    `episode`,
    `minio_link`,
    `root_path`,
    `file_name`,
    `reason`,
    `create_time`
FROM rss_episode_failed;

DROP TABLE rss_episode_failed;

ALTER TABLE rss_episode_failed_new RENAME TO rss_episode_failed;

CREATE INDEX `idx_rss_epf_subs_id` ON rss_episode_failed (`rss_subs_id`);

CREATE INDEX `idx_rss_epf_task_id` ON rss_episode_failed (`rss_task_id`);