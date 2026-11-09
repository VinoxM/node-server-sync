ALTER TABLE channel_notification ADD COLUMN `event` VARCHAR(50) NOT NULL DEFAULT 'message';
ALTER TABLE channel_notification ADD COLUMN `title` VARCHAR(200) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS `idx_channel_notification_event` ON channel_notification(`event`);
