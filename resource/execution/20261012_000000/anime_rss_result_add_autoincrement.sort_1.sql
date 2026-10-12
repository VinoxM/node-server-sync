ALTER TABLE rss_result RENAME TO rss_result_old;

CREATE TABLE rss_result (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `pid` integer NOT NULL,
    `title` varchar(500) NOT NULL,
    `torrent` varchar(100) NOT NULL,
    `pub_date` varchar(100) DEFAULT NULL,
    `hide` integer NOT NULL DEFAULT 0,
    `tracker` varchar(5000),
    `episode` varchar(10) DEFAULT NULL,
    `sort` integer NOT NULL DEFAULT 0,
    CONSTRAINT `idx_pid_title` UNIQUE (`pid`, `title`)
);

INSERT INTO rss_result (
    `id`,
    `pid`,
    `title`,
    `torrent`,
    `pub_date`,
    `hide`,
    `tracker`,
    `episode`,
    `sort`
)
SELECT
    `id`,
    `pid`,
    `title`,
    `torrent`,
    `pub_date`,
    `hide`,
    `tracker`,
    `episode`,
    `sort`
FROM rss_result_old
ORDER BY `id`;

DROP TABLE rss_result_old;

CREATE INDEX `idx_rss_result_pid_hide`
    ON rss_result (`pid`, `hide`, `pub_date`, `sort`, `episode`);