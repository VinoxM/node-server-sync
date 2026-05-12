CREATE TABLE rss_fonts_new (
    `id` integer PRIMARY KEY NOT NULL,
    `title` text NOT NULL,
    `minio_link` text DEFAULT NULL,
    `object_size` text DEFAULT NULL,
    CONSTRAINT `idx_rss_fonts_title` UNIQUE (`title`)
);

INSERT INTO rss_fonts_new (`id`, `title`, `minio_link`)
SELECT `id`, `title`, `minio_link` FROM rss_fonts;

DROP TABLE rss_fonts;

ALTER TABLE rss_fonts_new RENAME TO rss_fonts;

CREATE INDEX `idx_rss_fonts_object_size` ON rss_fonts (`object_size`);