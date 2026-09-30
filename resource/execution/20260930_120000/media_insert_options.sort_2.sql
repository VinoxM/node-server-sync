INSERT INTO
    options (
        `label`,
        `description`,
        `value`,
        `value_type`,
        `default_value`,
        `validation_rule`,
        `update_time`
    )
VALUES (
        'CrawlPushNotificationWithCover',
        'Whether to include a cover when pushing a message after the crawler succeeds. 0: Disable, 1: Enable; Default: 0; ',
        '0',
        'boolean',
        '0',
        '{"trueValue":"1","falseValue":"0","trueLabel":"Enabled","falseLabel":"Disabled"}',
        datetime('now')
    )