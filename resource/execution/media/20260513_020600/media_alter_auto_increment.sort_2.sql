CREATE TABLE categories_new (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `name` varchar(100) NOT NULL,
    `type` integer NOT NULL DEFAULT 0,
    CONSTRAINT `idx_category_name` UNIQUE (`name`)
);

INSERT INTO
    categories_new (`id`, `name`, `type`)
SELECT `id`, `name`, `type`
FROM categories;

DROP TABLE categories;

ALTER TABLE categories_new RENAME TO categories;