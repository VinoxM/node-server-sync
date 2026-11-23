/**
 * Magic Book 同步实体类型常量
 * @readonly
 * @enum {string}
 */
export const SYNC_ENTITY_TYPE = {
    DOCUMENT: 'document',
    PROFILE: 'profile',
    VAULT: 'vault'
};

/**
 * Magic Book 配置作用域类型常量 (泛型二维作用域模型)
 * @readonly
 * @enum {string}
 */
export const SYNC_SCOPE_TYPE = {
    GLOBAL: 'global',
    USER: 'user',
    PROFILE: 'profile',
    ORG: 'org',
    DEVICE: 'device'
};

/**
 * Magic Book 配置作用域常量 (兼容历史旧引用)
 * @readonly
 * @enum {string}
 */
export const SYNC_SCOPE = {
    GLOBAL: 'global',
    USER: 'user',
    PROFILE: 'profile'
};

/**
 * 同步拉取限制常量
 */
export const SYNC_PULL_LIMIT = {
    DEFAULT: 100,
    MAX: 500
};

/**
 * 密码金库核心配置常量 (Phase 10: Vault E2EE Constants)
 */
export const VAULT_CONFIG = {
    MAX_CIPHER_LENGTH: 16 * 1024, // 单条密文上限 16KB
    MAX_ENTRIES_PER_USER: 2000,   // 单用户最大凭据条数
    MAX_TOTAL_BYTES_PER_USER: 10 * 1024 * 1024, // 单用户最大总密文字节数 10MB
    DEFAULT_PAGE_SIZE: 200,       // Keyset 快照默认分页大小
    MAX_PAGE_SIZE: 200,          // Keyset 快照最大分页大小
    MAX_IMPORT_BATCH_SIZE: 200,  // 批量导入单批上限
    MIN_PBKDF2_ITERATIONS: 600000, // PBKDF2 最小安全迭代次数基线
    ALLOWED_KDF_ALGS: Object.freeze(['pbkdf2-sha256', 'argon2id']), // 允许的 KDF 算法白名单
    MIN_SALT_BYTES: 16            // 随机盐最小字节数
};

/**
 * 密码金库标准业务错误码
 * @readonly
 * @enum {string}
 */
export const VAULT_ERROR_CODE = Object.freeze({
    VERSION_CONFLICT: 'VERSION_CONFLICT',
    EPOCH_STALE: 'EPOCH_STALE',
    EPOCH_INVALID: 'EPOCH_INVALID',
    VAULT_NOT_FOUND: 'VAULT_NOT_FOUND',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    KDF_PARAM_INSECURE: 'KDF_PARAM_INSECURE',
    RESET_CONFIRM_REQUIRED: 'RESET_CONFIRM_REQUIRED',
    INVALID_UUID: 'INVALID_UUID'
});

