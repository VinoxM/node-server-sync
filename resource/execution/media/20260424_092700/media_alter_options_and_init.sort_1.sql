DROP TABLE IF EXISTS options;

CREATE TABLE options (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `label` text NOT NULL,
    `description` text DEFAULT NULL,
    `value` text DEFAULT NULL,
    `update_time` datetime NOT NULL,
    CONSTRAINT `idx_media_opts_label` UNIQUE (`label`)
);

INSERT INTO
    options (
        `label`,
        `description`,
        `value`,
        `update_time`
    )
VALUES (
        'MediaPolicyMode',
        'Media policy mode;\\n0: Default not allowed;\\n1: Default allowed;',
        '1',
        datetime('now')
    )