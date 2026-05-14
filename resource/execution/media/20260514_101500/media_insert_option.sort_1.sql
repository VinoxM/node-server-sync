INSERT INTO
    options (
        `label`,
        `description`,
        `value`,
        `update_time`
    )
VALUES (
        'PushNotificationWhenBiliveStreamChanged',
        'Push notification when bilive stream changed;\n0: disable, 1: enable;\nDefault: 0;',
        '0',
        datetime('now')
    )