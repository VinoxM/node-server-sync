CREATE TABLE authors_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `category_id` integer NOT NULL,
    `name` varchar(100) NOT NULL,
    CONSTRAINT `idx_author_name` UNIQUE (`category_id`, `name`)
);

INSERT INTO
    authors_new (`id`, `category_id`, `name`)
SELECT `id`, `category_id`, `name`
FROM authors;

DROP TABLE authors;

ALTER TABLE authors_new RENAME TO authors;

CREATE INDEX `idx_authors_category` ON authors (`category_id`);