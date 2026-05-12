CREATE TABLE rss_episode_new (
    `id` integer PRIMARY KEY NOT NULL,
    `rss_task_id` integer NOT NULL,
    `rss_subs_id` integer NOT NULL,
    `episode` varchar(10) NOT NULL,
    `minio_link` varchar(500) DEFAULT NULL,
    `status` varchar(1) NOT NULL,
    `object_size` text DEFAULT NULL,
    CONSTRAINT `idx_rss_id_episode` UNIQUE (`rss_subs_id`, `episode`)
);

INSERT INTO rss_episode_new (`id`, `rss_task_id`, `rss_subs_id`, `episode`, `minio_link`, `status`)
SELECT `id`, `rss_task_id`, `rss_subs_id`, `episode`, `minio_link`, `status` FROM rss_episode;

DROP TABLE rss_episode;

ALTER TABLE rss_episode_new RENAME TO rss_episode;

CREATE INDEX `idx_rss_ep_task_id` ON rss_episode (`rss_task_id`);

CREATE INDEX `idx_rss_ep_object_size` ON rss_episode (`object_size`);