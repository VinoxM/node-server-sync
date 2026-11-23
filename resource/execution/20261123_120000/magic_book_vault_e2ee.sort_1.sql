-- ==============================================================================
-- 迁移说明: Phase 10 (Magic Book 密码安全金库端到端加密漫游与元数据底座)
-- 1. 新建 vault_meta 金库元数据表（支持 CAS 乐观锁版本控制、Epoch 纪元管理与离线恢复信封）
-- 2. 新建 vault_entries 密码条目密文快照表（仅存不透明密文，解耦客户端修订号与服务端时序）
-- 3. 新建 vault_audit 金库生命周期安全审计日志表
-- ==============================================================================

CREATE TABLE IF NOT EXISTS vault_meta (
  `uid` INTEGER PRIMARY KEY NOT NULL,
  `epoch` INTEGER NOT NULL DEFAULT 1,
  `version` INTEGER NOT NULL DEFAULT 1,
  `state` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `key_id` VARCHAR(16) NOT NULL,
  `kdf_alg` VARCHAR(32) NOT NULL DEFAULT 'pbkdf2-sha256',
  `kdf_iterations` INTEGER NOT NULL,
  `kdf_salt` VARCHAR(64) NOT NULL,
  `wrapped_dek` TEXT NOT NULL,
  `recovery_wrapped_dek` TEXT DEFAULT NULL,
  `recovery_salt` VARCHAR(64) DEFAULT NULL,
  `recovery_iterations` INTEGER DEFAULT NULL,
  `content_hash` VARCHAR(64) DEFAULT NULL,
  `last_device_id` VARCHAR(64) DEFAULT NULL,
  `update_time` DATETIME NOT NULL,
  `create_time` DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_vault_meta_epoch` ON vault_meta(`uid`, `epoch`);

CREATE TABLE IF NOT EXISTS vault_entries (
  `id` VARCHAR(36) PRIMARY KEY NOT NULL,
  `uid` INTEGER NOT NULL,
  `epoch` INTEGER NOT NULL,
  `cipher` TEXT NOT NULL,
  `client_version` BIGINT NOT NULL DEFAULT 1,
  `key_id` VARCHAR(16) NOT NULL,
  `is_deleted` INTEGER NOT NULL DEFAULT 0,
  `update_time` DATETIME NOT NULL,
  CONSTRAINT `idx_vault_entries_uid_id` UNIQUE (`uid`, `id`)
);
CREATE INDEX IF NOT EXISTS `idx_vault_entries_query` ON vault_entries(`uid`, `epoch`, `is_deleted`);

CREATE TABLE IF NOT EXISTS vault_audit (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `uid` INTEGER NOT NULL,
  `epoch` INTEGER NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `device_id` VARCHAR(64) NOT NULL,
  `detail` TEXT DEFAULT NULL,
  `create_time` DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_vault_audit_uid` ON vault_audit(`uid`, `create_time`);
