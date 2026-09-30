ALTER TABLE options ADD COLUMN `value_type` text NOT NULL DEFAULT 'string';
ALTER TABLE options ADD COLUMN `default_value` text DEFAULT NULL;
ALTER TABLE options ADD COLUMN `validation_rule` text DEFAULT NULL;

UPDATE options
SET
    `value_type` = 'select',
    `default_value` = '1',
    `validation_rule` = '{"options":[{"value":"0","label":"Not allowed"},{"value":"1","label":"Allowed"}]}'
WHERE `label` = 'MediaPolicyMode';

UPDATE options
SET
    `value_type` = 'integer',
    `default_value` = '5000',
    `validation_rule` = '{"min":100,"max":600000}'
WHERE `label` = 'MediaUploadTimeout';

UPDATE options
SET
    `value_type` = 'boolean',
    `default_value` = '1',
    `validation_rule` = '{"trueValue":"1","falseValue":"0","trueLabel":"Enabled","falseLabel":"Disabled"}'
WHERE `label` = 'MediaSafelyDeleteStorage';

UPDATE options
SET
    `value_type` = 'boolean',
    `default_value` = '0',
    `validation_rule` = '{"trueValue":"1","falseValue":"0","trueLabel":"Enabled","falseLabel":"Disabled"}'
WHERE `label` = 'MediaAutoDeleteStreamFile';

UPDATE options
SET
    `value_type` = 'boolean',
    `default_value` = '0',
    `validation_rule` = '{"trueValue":"1","falseValue":"0","trueLabel":"Enabled","falseLabel":"Disabled"}'
WHERE `label` = 'PushNotificationWhenBiliveStreamChanged';

UPDATE options
SET
    `value_type` = 'boolean',
    `default_value` = '0',
    `validation_rule` = '{"trueValue":"1","falseValue":"0","trueLabel":"Enabled","falseLabel":"Disabled"}'
WHERE `label` = 'ConvertBiliveStreamFileFlvToMp4';

UPDATE options
SET
    `value_type` = 'boolean',
    `default_value` = '1',
    `validation_rule` = '{"trueValue":"1","falseValue":"0","trueLabel":"Enabled","falseLabel":"Disabled"}'
WHERE `label` = 'DeleteAuthorSafely';

UPDATE options
SET
    `default_value` = COALESCE(`default_value`, `value`)
WHERE `default_value` IS NULL;
