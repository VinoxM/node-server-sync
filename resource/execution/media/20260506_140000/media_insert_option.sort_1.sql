INSERT INTO
    options (
        `label`,
        `description`,
        `value`,
        `update_time`
    )
VALUES (
        'MediaAutoDeleteStreamFile',
        'Media auto delete the stream file after successful upload;\n0: disable, 1: enable;\nDefault: 0;',
        '0',
        datetime('now')
    )