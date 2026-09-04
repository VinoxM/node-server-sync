/** Bangumi 番剧对象存储 Bucket 名称 */
export const SUBJECT_MINIO_BUCKET = 'bangumi';

/**
 * 番剧条目隐藏状态枚举
 * @readonly
 * @enum {number}
 */
export const SUBJECT_HIDE_VALUE = {
    /** 正常显示 */
    NO: 0,
    /** 隐藏 */
    YES: 1
};

/**
 * 番剧订阅完结状态枚举
 * @readonly
 * @enum {number}
 */
export const SUBSCRIBE_FIN_VALUE = {
    /** 未完结 (连载中) */
    NO: 0,
    /** 已完结 */
    YES: 1
};

/**
 * 番剧订阅跨季连载状态枚举
 * @readonly
 * @enum {number}
 */
export const SUBSCRIBE_GOON_VALUE = {
    /** 不跨季 */
    NO: 0,
    /** 跨季继续更新 */
    YES: 1
};

/**
 * RSS 抓取结果隐藏状态枚举
 * @readonly
 * @enum {number}
 */
export const SUBSCRIBE_RESULT_HIDE_VALUE = {
    /** 正常展示 */
    NO: 0,
    /** 隐藏 */
    YES: 1
};

/**
 * Bangumi 封面/角色图片缓存同步状态枚举
 * @readonly
 * @enum {number}
 */
export const BANGUMI_IMAGES_STATUS = {
    /** 删除失败 */
    REMOVE_FAILED: -2,
    /** 删除中 */
    REMOVING: -1,
    /** 待同步 */
    PREPARED: 0,
    /** 正在同步至 MinIO */
    PENDING: 1,
    /** 同步完成 */
    COMPLETE: 2
};

/**
 * 番剧 NSFW 限制级标识枚举
 * @readonly
 * @enum {number}
 */
export const SUBJECT_NSFW_VALUE = {
    /** 全年龄 */
    NO: 0,
    /** 限制级/R18 */
    YES: 1
};

/** 泡面番平台类型常量 */
export const SUBJECT_PLATFORM_IS_SHORT = 'TV_Short';

/** 标准 TV 动画平台类型常量 */
export const SUBJECT_PLATFORM_DEFAULT = 'TV';