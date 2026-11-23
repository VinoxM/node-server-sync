/**
 * MagicBook 金库与同步模块 TypeScript / JSDoc 类型契约定义
 */

/**
 * 云端金库主信封与安全元数据实体
 */
export interface VaultMetaEntity {
  /** 用户唯一 ID */
  uid: number;
  /** 纪元编号 (从 1 开始递增，重置时递增) */
  epoch: number;
  /** 信封版本号 (CAS 乐观锁版本，从 1 开始递增) */
  version: number;
  /** 金库状态 ('ACTIVE' | 'ARCHIVED') */
  state: 'ACTIVE' | 'ARCHIVED';
  /** 主加密密钥标识 ID (如 UUID) */
  keyId: string;
  /** KDF 派生算法 ('pbkdf2-sha256' | 'argon2id') */
  kdfAlg: string;
  /** KDF 迭代轮数 (PBKDF2 >= 600,000) */
  kdfIterations: number;
  /** KDF 随机盐 (Base64 字符串，长度 >= 16 字节) */
  kdfSalt: string;
  /** 主密码加密包装后的 DEK 密文 (Base64) */
  wrappedDek: string;
  /** 恢复密钥加密包装后的 DEK 密文 (Base64，可选) */
  recoveryWrappedDek?: string | null;
  /** 恢复密钥派生随机盐 (Base64，可选) */
  recoverySalt?: string | null;
  /** 恢复密钥派生迭代轮数 (可选) */
  recoveryIterations?: number | null;
  /** 信封内容完整性 SHA-256 哈希 (十六进制，可选) */
  contentHash?: string | null;
  /** 最近一次修改信封的设备标识 ID */
  lastDeviceId?: string | null;
  /** 首次创建时间戳（毫秒） */
  createTime?: number;
  /** 最近更新时间戳（毫秒） */
  updateTime?: number;
}

/**
 * 传输层金库完整信封数据对象 (DTO)
 */
export interface VaultEnvelopeDTO {
  /** 纪元编号 */
  epoch: number;
  /** 信封版本号 */
  version: number;
  /** 密钥标识 ID */
  key_id: string;
  /** 主密码加密的 DEK 密文 */
  wrapped_dek: string;
  /** 恢复密钥加密的 DEK 密文 */
  recovery_wrapped_dek?: string | null;
  /** KDF 算法 */
  kdf_alg: string;
  /** KDF 迭代轮数 */
  kdf_iterations: number;
  /** KDF 主盐 */
  kdf_salt: string;
  /** 恢复密钥随机盐 */
  recovery_salt?: string | null;
  /** 恢复密钥迭代轮数 */
  recovery_iterations?: number | null;
  /** 信封内容哈希校验值 */
  content_hash?: string | null;
  /** 金库状态 */
  state?: string;
  /** 最近更新时间戳 */
  update_time?: number;
}

/**
 * 用户凭据密文存储条目实体
 */
export interface VaultEntryEntity {
  /** 凭据唯一主键 ID (UUID 格式) */
  id: string;
  /** 用户唯一 ID */
  uid: number;
  /** 所属纪元编号 */
  epoch: number;
  /** 凭据加密载荷密文字符串 (上限 16KB) */
  cipher: string;
  /** 客户端递增版本号 (用于冲突仲裁) */
  clientVersion: number;
  /** 加密该凭据所用的密钥标识 ID */
  keyId: string;
  /** 是否已被逻辑删除 (0: 正常, 1: 已删除) */
  isDeleted: number;
  /** 记录创建时间戳（毫秒） */
  createTime?: number;
  /** 记录最后修改时间戳（毫秒） */
  updateTime?: number;
}

/**
 * 金库关键操作审计记录实体
 */
export interface VaultAuditEntity {
  /** 自增审计流水 ID */
  id?: number;
  /** 用户唯一 ID */
  uid: number;
  /** 操作发生时的纪元编号 */
  epoch: number;
  /** 操作行为动作 ('ENVELOPE_INIT' | 'ENVELOPE_UPDATE' | 'ENVELOPE_ROTATE' | 'VAULT_RESET' 等) */
  action: string;
  /** 发起操作的设备 ID */
  deviceId: string;
  /** 发起操作的客户端真实 IP */
  ip?: string;
  /** 审计扩展上下文详情 JSON 文本 */
  detail?: string;
  /** 审计发生时间戳（毫秒） */
  createTime?: number;
}

/**
 * Keyset 游标分页快照返回结构体
 */
export interface VaultSnapshotResult {
  /** 当前分页活跃凭据列表 */
  items: Array<{
    /** 凭据主键 ID */
    id: string;
    /** 凭据密文 */
    cipher: string;
    /** 加密该凭据的密钥 ID */
    key_id: string;
    /** 客户端版本号 */
    client_version: number;
    /** 最近修改时间戳 */
    update_time: number;
  }>;
  /** 下一页游标标识 (为 null 表示已到达末尾) */
  next_page_token: string | null;
  /** 活跃凭据总条数 */
  total: number;
}

/**
 * 批量迁移导入凭据单项载荷
 */
export interface VaultImportEntry {
  /** 凭据唯一主键 ID (UUID 格式) */
  id: string;
  /** 凭据加密密文 (上限 16KB) */
  cipher: string;
  /** 关联的密钥标识 ID */
  key_id: string;
  /** 客户端版本号 */
  client_version: number;
}

/**
 * 同步增量推送单项变更
 */
export interface SyncChangeItem {
  /** 实体类型 (如 'vault', 'document', 'profile' 等) */
  entity_type: string;
  /** 作用域类型 ('user' | 'profile') */
  scope_type?: string;
  /** 作用域 ID */
  scope_id?: string;
  /** Profile ID */
  profile_id?: string;
  /** 条目唯一名称或主键 ID */
  name: string;
  /** 实体数据内容（密文或序列化字符串） */
  value?: string;
  /** 是否删除 */
  is_deleted?: number | boolean;
  /** 客户端操作时间戳 */
  client_timestamp?: number;
  /** 金库实体专属纪元 */
  epoch?: number;
  /** 金库实体专属加密密钥 ID */
  key_id?: string;
  /** 客户端逻辑版本号 */
  client_version?: number;
}

/**
 * 同步变更推送执行结果
 */
export interface SyncPushResult {
  /** 是否成功 */
  success: boolean;
  /** 最新的全局同步游标 */
  latest_cursor: number;
  /** 成功应用的变更条数 */
  applied: number;
  /** 被拒绝的条目详情列表 (防静默丢弃) */
  rejected: Array<{
    /** 条目标识 ID */
    id: string;
    /** 拒绝原因错误码 */
    reason: string;
  }>;
}
