-- Active: 1790736147871@@127.0.0.1@3306
UPDATE `options`
SET
    `label` = 'CrawlPushNotification',
    `value_type` = 'select',
    `default_value` = '0',
    `validation_rule` = '{"options":[{"value":"0","label":"Disabled"},{"value":"1","label":"Enable"},{"value":"2","label":"WithCover"}]}'
WHERE
    `label` = 'CrawlPushNotificationWithCover';