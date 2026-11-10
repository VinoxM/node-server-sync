-- ==============================================================================
-- 迁移说明:
-- 1. 将属于用户通用偏好的 4 项配置 ('profilePreferences', 'pendantDomainAudio', 'messageHandlers', 'shortcuts')
--    从历史的 'global' 作用域平滑迁移升格至 'user' 作用域 (profile_id 置为空字符串)。
-- 2. 彻底清除其余属于单机物理硬件/窗口几何状态的无效 'global' 数据 (如 windowState, deviceSuits 等)。
-- ==============================================================================

-- 1.1 幂等保护：若已存在相同 (uid, 'user', '', name) 记录，清理旧 global 避免唯一键冲突
DELETE FROM sync_documents
WHERE scope = 'global'
  AND name IN ('profilePreferences', 'pendantDomainAudio', 'messageHandlers', 'shortcuts')
  AND EXISTS (
    SELECT 1 FROM sync_documents d2
    WHERE d2.uid = sync_documents.uid
      AND d2.scope = 'user'
      AND d2.profile_id = ''
      AND d2.name = sync_documents.name
  );

-- 1.2 将这 4 项配置在 sync_documents 快照表中升格为 user 作用域
UPDATE sync_documents
SET scope = 'user', profile_id = ''
WHERE scope = 'global'
  AND name IN ('profilePreferences', 'pendantDomainAudio', 'messageHandlers', 'shortcuts');

-- 1.3 同步更新 sync_changelog 流水记录
UPDATE sync_changelog
SET scope = 'user', profile_id = ''
WHERE scope = 'global'
  AND name IN ('profilePreferences', 'pendantDomainAudio', 'messageHandlers', 'shortcuts');

-- 2.1 彻底清理 sync_documents 快照表中剩余的所有单机 global 配置 (窗口几何坐标、硬件 GUID 等)
DELETE FROM sync_documents
WHERE scope = 'global';

-- 2.2 彻底清理 sync_changelog 流水表中剩余的所有单机 global 变更记录
DELETE FROM sync_changelog
WHERE scope = 'global';
