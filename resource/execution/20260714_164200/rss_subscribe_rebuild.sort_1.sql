CREATE TABLE IF NOT EXISTS rss_subscribe_new (
    `id` integer PRIMARY KEY NOT NULL,
    `name` varchar(50) NOT NULL,
    `name_jp` varchar(50) DEFAULT NULL,
    `url` varchar(500) DEFAULT NULL,
    `regex` varchar(100) NOT NULL,
    `season` varchar(50) NOT NULL,
    `start_time` datetime DEFAULT NULL,
    `cover` varchar(500) DEFAULT NULL,
    `fin` varchar(1) DEFAULT 'N',
    `is_short` int NOT NULL DEFAULT '0',
    `anime_type` int NOT NULL DEFAULT '1',
    `goon` int NOT NULL DEFAULT '0',
    `staff` varchar(500) DEFAULT NULL,
    `cast` varchar(500) DEFAULT NULL,
    `origin_type` varchar(20) DEFAULT NULL,
    `type_tag` varchar(100) DEFAULT NULL,
    `broadcast` varchar(100) DEFAULT NULL,
    `sync_status` int NOT NULL DEFAULT -1,
    CONSTRAINT `idx_name` UNIQUE (`name`),
    CONSTRAINT `idx_season_cover` UNIQUE (`season`, `cover`)
);

INSERT INTO
    rss_subscribe_new (
        id,
        name,
        name_jp,
        url,
        regex,
        season,
        start_time,
        cover,
        fin,
        is_short,
        anime_type,
        goon,
        staff,
        `cast`,
        origin_type,
        type_tag,
        broadcast
    )
SELECT
    id,
    name,
    name_jp,
    url,
    regex,
    season,
    start_time,
    cover,
    fin,
    is_short,
    anime_type,
    goon,
    staff,
    `cast`,
    origin_type,
    type_tag,
    broadcast
FROM rss_subscribe
ORDER BY id;

DROP TABLE rss_subscribe;

ALTER TABLE rss_subscribe_new RENAME TO rss_subscribe;

VACUUM;