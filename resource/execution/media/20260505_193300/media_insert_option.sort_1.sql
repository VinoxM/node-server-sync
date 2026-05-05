INSERT INTO
    options (
        `label`,
        `description`,
        `value`,
        `update_time`
    )
VALUES (
        'MediaSafelyDeleteStorage',
        'Media safely delete storage, when task exists cannot delete;\n0: false, 1: true;\nDefault: 1;',
        '1',
        datetime('now')
    )