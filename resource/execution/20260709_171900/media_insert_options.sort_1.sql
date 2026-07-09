INSERT INTO
    options (
        `label`,
        `description`,
        `value`,
        `update_time`
    )
VALUES (
        'DeleteAuthorSafely',
        'Safely to delete author if videos not exists under the author; 0: Disable, 1: Enable; Default: 1; If disabled, all Videos under the Author will also be deleted.',
        '1',
        datetime('now')
    )