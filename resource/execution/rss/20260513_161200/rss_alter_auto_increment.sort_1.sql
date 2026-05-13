CREATE TABLE rss_torrent_task_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `rss_subs_id` integer NOT NULL,
    `rss_result_id` integer NOT NULL,
    `torrent_uuid` varchar(12) DEFAULT NULL,
    `torrent_hash` varchar(256) DEFAULT NULL,
    `status` varchar(1) NOT NULL,
    CONSTRAINT `idx_rss_result_id` UNIQUE (`rss_result_id`)
);

INSERT INTO
    rss_torrent_task_new (
        `id`,
        `rss_subs_id`,
        `rss_result_id`,
        `torrent_uuid`,
        `torrent_hash`,
        `status`
    )
SELECT
    `id`,
    `rss_subs_id`,
    `rss_result_id`,
    `torrent_uuid`,
    `torrent_hash`,
    `status`
FROM rss_torrent_task;

DROP TABLE rss_torrent_task;

ALTER TABLE rss_torrent_task_new RENAME TO rss_torrent_task;

CREATE INDEX `idx_rss_tt_subs_id` ON rss_torrent_task (`rss_subs_id`);