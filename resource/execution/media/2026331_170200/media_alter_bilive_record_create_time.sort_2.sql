ALTER TABLE bilive_record ADD COLUMN `create_time` datetime DEFAULT NULL;

UPDATE bilive_record SET create_time=event_timestamp;