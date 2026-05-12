CREATE TABLE tags_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `name` varchar(100) NOT NULL,
    CONSTRAINT `idx_tag_name` UNIQUE (`name`)
);

INSERT INTO
    tags_new (`id`, `name`)
SELECT `id`, `name`
FROM tags;

DROP TABLE tags;

ALTER TABLE tags_new RENAME TO tags;