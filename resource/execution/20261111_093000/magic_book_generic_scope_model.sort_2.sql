-- ==============================================================================
-- 迁移说明: Phase 9 (泛型二维作用域模型升级)
-- 1. 将 sync_documents 表中的 (scope, profile_id) 升级为泛型 (scope_type, scope_id)
-- 2. 将 sync_changelog 表中的 (scope, profile_id) 升级为泛型 (scope_type, scope_id)
-- 3. 历史数据无损映射转换：
--    - scope = 'user' -> scope_type = 'user', scope_id = CAST(uid AS TEXT)
--    - scope = 'profile' -> scope_type = 'profile', scope_id = uid || ':' || profile_id
--    - 清理可能残留的单机 global 配置
-- ==============================================================================

-- 1. 重构 sync_documents 快照表
DROP INDEX IF EXISTS idx_sync_docs_lookup;
ALTER TABLE sync_documents RENAME TO sync_documents_old;

CREATE TABLE sync_documents (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `uid` INTEGER NOT NULL,
  `scope_type` VARCHAR(32) NOT NULL,
  `scope_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `last_device_id` VARCHAR(64) DEFAULT NULL,
  `is_deleted` INTEGER NOT NULL DEFAULT 0,
  `update_time` DATETIME NOT NULL,
  CONSTRAINT `idx_sync_docs_unique` UNIQUE (`uid`, `scope_type`, `scope_id`, `name`)
);

CREATE INDEX `idx_sync_docs_lookup` ON sync_documents(`uid`, `scope_type`, `scope_id`, `name`);

INSERT INTO sync_documents (`id`, `uid`, `scope_type`, `scope_id`, `name`, `value`, `version`, `last_device_id`, `is_deleted`, `update_time`)
SELECT
  `id`,
  `uid`,
  CASE
    WHEN `scope` = 'user' THEN 'user'
    WHEN `scope` = 'global' THEN 'global'
    ELSE 'profile'
  END AS `scope_type`,
  CASE
    WHEN `scope` = 'user' THEN CAST(`uid` AS TEXT)
    WHEN `scope` = 'global' THEN 'global'
    ELSE `uid` || ':' || `profile_id`
  END AS `scope_id`,
  `name`,
  `value`,
  `version`,
  `last_device_id`,
  `is_deleted`,
  `update_time`
FROM sync_documents_old
WHERE `scope` != 'global';

DROP TABLE sync_documents_old;

-- 2. 重构 sync_changelog 流水表
DROP INDEX IF EXISTS idx_sync_changelog_scan;
DROP INDEX IF EXISTS idx_sync_changelog_clean;
ALTER TABLE sync_changelog RENAME TO sync_changelog_old;

CREATE TABLE sync_changelog (
  `cursor` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `uid` INTEGER NOT NULL,
  `device_id` VARCHAR(64) NOT NULL,
  `entity_type` VARCHAR(20) NOT NULL,
  `scope_type` VARCHAR(32) DEFAULT NULL,
  `scope_id` VARCHAR(128) DEFAULT NULL,
  `name` VARCHAR(64) DEFAULT NULL,
  `value` TEXT DEFAULT NULL,
  `is_deleted` INTEGER NOT NULL DEFAULT 0,
  `client_timestamp` BIGINT NOT NULL,
  `create_time` DATETIME NOT NULL
);

CREATE INDEX `idx_sync_changelog_scan` ON sync_changelog(`uid`, `cursor` ASC);
CREATE INDEX `idx_sync_changelog_clean` ON sync_changelog(`create_time`);

INSERT INTO sync_changelog (`cursor`, `uid`, `device_id`, `entity_type`, `scope_type`, `scope_id`, `name`, `value`, `is_deleted`, `client_timestamp`, `create_time`)
SELECT
  `cursor`,
  `uid`,
  `device_id`,
  `entity_type`,
  CASE
    WHEN `entity_type` = 'profile' THEN 'profile'
    WHEN `scope` = 'user' THEN 'user'
    WHEN `scope` = 'global' THEN 'global'
    ELSE 'profile'
  END AS `scope_type`,
  CASE
    WHEN `entity_type` = 'profile' THEN `uid` || ':' || `profile_id`
    WHEN `scope` = 'user' THEN CAST(`uid` AS TEXT)
    WHEN `scope` = 'global' THEN 'global'
    ELSE `uid` || ':' || `profile_id`
  END AS `scope_id`,
  `name`,
  `value`,
  `is_deleted`,
  `client_timestamp`,
  `create_time`
FROM sync_changelog_old
WHERE `scope` != 'global' OR `scope` IS NULL;

DROP TABLE sync_changelog_old;
