/**
 * Magic Book 同步实体类型常量
 * @readonly
 * @enum {string}
 */
export const SYNC_ENTITY_TYPE = {
    DOCUMENT: 'document',
    PROFILE: 'profile'
};

/**
 * Magic Book 配置作用域常量
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

