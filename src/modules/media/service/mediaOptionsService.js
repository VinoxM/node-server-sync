import optionsRep from "../repository/optionsRep.js";

let CACHE_INITIALIZED = false;
/** @type {Map<string, Option>} 配置项内存缓存 */
const cache = new Map();

/**
 * @typedef {Object} Option
 * @property {number} id
 * @property {string} label
 * @property {string} description
 * @property {string} value
 * @property {string} valueType
 * @property {string|null} defaultValue
 * @property {string|null} validationRule
 * @property {string} updateTime
 */

const OPTION_VALUE_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'select', 'textarea', 'password']);

function parseValidationRule(option) {
    if (__isBlank(option?.validationRule)) return {};
    try {
        const rule = JSON.parse(option.validationRule);
        return rule && typeof rule === 'object' && !Array.isArray(rule) ? rule : {};
    } catch (error) {
        __log.warn(`[Media Options] Invalid validation rule for ${option?.label}.`, error);
        return {};
    }
}

function normalizeOptionValue(option, value) {
    const valueType = OPTION_VALUE_TYPES.has(option?.valueType) ? option.valueType : 'string';
    const rule = parseValidationRule(option);
    const normalizedValue = value === null || value === undefined ? '' : String(value).trim();

    if (valueType === 'boolean') {
        const trueValue = String(rule.trueValue ?? '1');
        const falseValue = String(rule.falseValue ?? '0');
        if (normalizedValue !== trueValue && normalizedValue !== falseValue) {
            __throwMessage(`Invalid value for option ${option.label}: expected ${trueValue} or ${falseValue}.`);
        }
        return normalizedValue;
    }

    if (valueType === 'select') {
        const allowedValues = Array.isArray(rule.options)
            ? rule.options.map(item => String(item?.value ?? item)).filter(Boolean)
            : [];
        if (allowedValues.length > 0 && !allowedValues.includes(normalizedValue)) {
            __throwMessage(`Invalid value for option ${option.label}: expected one of ${allowedValues.join(', ')}.`);
        }
        return normalizedValue;
    }

    if (valueType === 'integer') {
        if (!/^-?\d+$/.test(normalizedValue)) {
            __throwMessage(`Invalid value for option ${option.label}: expected an integer.`);
        }
        const numberValue = Number(normalizedValue);
        if (Number.isSafeInteger(rule.min) && numberValue < rule.min || Number.isSafeInteger(rule.max) && numberValue > rule.max) {
            __throwMessage(`Invalid value for option ${option.label}: expected a value between ${rule.min ?? '-∞'} and ${rule.max ?? '∞'}.`);
        }
        return String(numberValue);
    }

    if (valueType === 'number') {
        const numberValue = Number(normalizedValue);
        if (normalizedValue === '' || !Number.isFinite(numberValue)) {
            __throwMessage(`Invalid value for option ${option.label}: expected a number.`);
        }
        if (typeof rule.min === 'number' && numberValue < rule.min || typeof rule.max === 'number' && numberValue > rule.max) {
            __throwMessage(`Invalid value for option ${option.label}: expected a value between ${rule.min ?? '-∞'} and ${rule.max ?? '∞'}.`);
        }
        return String(numberValue);
    }

    if (typeof rule.maxLength === 'number' && normalizedValue.length > rule.maxLength) {
        __throwMessage(`Invalid value for option ${option.label}: maximum length is ${rule.maxLength}.`);
    }
    if (rule.pattern) {
        let pattern;
        try {
            pattern = new RegExp(rule.pattern);
        } catch (error) {
            __log.warn(`[Media Options] Invalid validation pattern for ${option.label}.`, error);
        }
        if (pattern && !pattern.test(normalizedValue)) {
            __throwMessage(`Invalid value for option ${option.label}.`);
        }
    }
    return normalizedValue;
}

/**
 * 根据配置标签获取选项对象
 * @param {string} [label=''] - 配置项标签
 * @returns {Promise<Option|null>}
 */
async function getOption(label = '') {
    if (__isBlank(label)) return null;
    if (cache.has(label)) {
        return cache.get(label);
    }
    const option = await optionsRep.selectByLabel(label);
    if (option) {
        cache.set(option.label, option);
    }
    return option;
}

/**
 * 获取配置项的值字符串
 * @param {string} [label=''] - 配置项标签
 * @returns {Promise<string|undefined>}
 */
async function getOptionValue(label = '') {
    const option = await getOption(label);
    return option?.value;
}

/**
 * 更新指定 ID 的配置项并同步刷新内存缓存
 * @param {number} id - 配置项 ID
 * @param {string} description - 配置项描述
 * @param {string} value - 配置项值
 * @returns {Promise<void>}
 */
export async function updateOption(id, description, value) {
    const option = await optionsRep.selectById(id);
    if (!option) {
        __throwMessage(`Option ${id} does not exist.`);
    }
    const normalizedValue = normalizeOptionValue(option, value);
    const { rows } = await optionsRep.updateById(id, normalizedValue, description);
    if (rows > 0) {
        const option = await optionsRep.selectById(id);
        option && cache.set(option.label, option);
    }
}

/**
 * 获取全部系统配置项列表（自动内存缓存）
 * @returns {Promise<Option[]>}
 */
export async function getOptions() {
    if (CACHE_INITIALIZED) {
        return Array.from(cache.values());
    }
    const { rows, data } = await optionsRep.selectAll();
    if (rows > 0 && __isNotEmptyArray(data)) {
        cache.clear();
        data.forEach(p => cache.set(p.label, p));
    }
    CACHE_INITIALIZED = true;
    return data;
}

/**
 * 安全解析整数，解析失败时返回默认值
 * @param {any} value - 原始值
 * @param {number} defaultValue - 默认回退值
 * @returns {number}
 */
function parseValueIntOr(value, defaultValue) {
    try {
        const result = parseInt(value ?? defaultValue);
        return isNaN(result) ? defaultValue : result;
    } catch (error) {
        return defaultValue;
    }
}

/** Media policy default allowed */
const MEDIA_POLICY_MODE_LABEL = 'MediaPolicyMode';
const MEDIA_POLICY_MODE = { NOT_ALLOWED: 0, ALLOWED: 1 };
const MEDIA_POLICY_MODE_DEFAULT_VALUE = MEDIA_POLICY_MODE.ALLOWED;

/**
 * 获取媒体入库过滤默认策略（是否默认允许）
 * @returns {Promise<boolean>}
 */
export async function getMediaPolicyDefaultAllowed() {
    const value = await getOptionValue(MEDIA_POLICY_MODE_LABEL);
    return parseValueIntOr(value, MEDIA_POLICY_MODE_DEFAULT_VALUE) === MEDIA_POLICY_MODE.ALLOWED;
}

/** Media upload timeout */
const MEDIA_UPLOAD_TIMEOUT_LABEL = 'MediaUploadTimeout';
const MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE = 5000;

/**
 * 获取媒体上传异步队列任务超时时长 (毫秒)
 * @returns {Promise<number>}
 */
export async function getMediaUploadTimeoutOption() {
    const value = await getOptionValue(MEDIA_UPLOAD_TIMEOUT_LABEL);
    return parseValueIntOr(value, MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE);
}

/** Media safely delete storage */
const MEDIA_SAFELY_DELETE_STORAGE_LABEL = 'MediaSafelyDeleteStorage';
const MEDIA_SAFELY_DELETE_STORAGE = { UNSAFELY: 0, SAFELY: 1 };
const MEDIA_SAFELY_DELETE_STORAGE_DEFAULT_VALUE = MEDIA_SAFELY_DELETE_STORAGE.SAFELY;

/**
 * 获取是否开启安全删除对象存储策略
 * @returns {Promise<boolean>}
 */
export async function getMediaSafelyDeleteStorage() {
    const value = await getOptionValue(MEDIA_SAFELY_DELETE_STORAGE_LABEL);
    return parseValueIntOr(value, MEDIA_SAFELY_DELETE_STORAGE_DEFAULT_VALUE) === MEDIA_SAFELY_DELETE_STORAGE.SAFELY;
}

/** Media auto delete the stream file after successful upload */
const MEDIA_AUTO_DELETE_STREAM_FILE_LABEL = "MediaAutoDeleteStreamFile";
const MEDIA_AUTO_DELETE_STREAM_FILE = { DISABLE: 0, ENABLE: 1 };
const MEDIA_AUTO_DELETE_STREAM_FILE_DEFAULT_VALUE = MEDIA_AUTO_DELETE_STREAM_FILE.DISABLE;

/**
 * 获取是否在切片全量上传 MinIO 成功后自动删除本地录制文件
 * @returns {Promise<boolean>}
 */
export async function getMediaAutoDeleteStreamFile() {
    const value = await getOptionValue(MEDIA_AUTO_DELETE_STREAM_FILE_LABEL);
    return parseValueIntOr(value, MEDIA_AUTO_DELETE_STREAM_FILE_DEFAULT_VALUE) === MEDIA_AUTO_DELETE_STREAM_FILE.ENABLE;
}

/** Push notification when bilive stream changed */
const PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_LABEL = "PushNotificationWhenBiliveStreamChanged";
const PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED = { DISABLE: 0, ENABLE: 1 };
const PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_DEFAULT_VALUE = PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED.DISABLE;

/**
 * 获取是否在 B站直播间开播/下播状态改变时推送系统通知
 * @returns {Promise<boolean>}
 */
export async function getPushNotificationWhenBiliveStreamChanged() {
    const value = await getOptionValue(PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_LABEL);
    return parseValueIntOr(value, PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_DEFAULT_VALUE) === PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED.ENABLE;
}

/** Convert bilive flv file to mp4 */
const CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_LABEL = "ConvertBiliveStreamFileFlvToMp4";
const CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4 = { DISABLE: 0, ENABLE: 1 };
const CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_DEFAULT_VALUE = CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4.DISABLE;

/**
 * 获取是否在录制切片上传前自动将 FLV 转码为 MP4
 * @returns {Promise<boolean>}
 */
export async function getConvertBiliveStreamFileFlvToMp4Option() {
    const value = await getOptionValue(CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_LABEL);
    return parseValueIntOr(value, CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_DEFAULT_VALUE) === CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4.ENABLE;
}

/** Delete author safely */
const DELETE_AUTHOR_SAFELY_LABEL = "DeleteAuthorSafely";
const DELETE_AUTHOR_SAFELY = { DISABLE: 0, ENABLE: 1 };
const DELETE_AUTHOR_SAFELY_DEFAULT_VALUE = DELETE_AUTHOR_SAFELY.ENABLE;

/**
 * 获取是否开启安全删除创作者策略（存在关联视频时禁止直接物理删除作者）
 * @returns {Promise<boolean>}
 */
export async function getDeleteAuthorSafely() {
    const value = await getOptionValue(DELETE_AUTHOR_SAFELY_LABEL);
    return parseValueIntOr(value, DELETE_AUTHOR_SAFELY_DEFAULT_VALUE) === DELETE_AUTHOR_SAFELY.ENABLE;
}

/** Crawl push notification with cover */
const CRAWL_PUSH_NOTIFICATION_WITH_COVER_LABEL = "CrawlPushNotificationWithCover";
const CRAWL_PUSH_NOTIFICATION_WITH_COVER = { DISABLE: 0, ENABLE: 1 };
const CRAWL_PUSH_NOTIFICATION_WITH_COVER_DEFAULT_VALUE = CRAWL_PUSH_NOTIFICATION_WITH_COVER.DISABLE;

/**
 * 获取是否开启爬虫消息推送附带封面
 * @returns {Promise<boolean>}
 */
export async function getCrawlPushNotificationWithCover() {
    const value = await getOptionValue(CRAWL_PUSH_NOTIFICATION_WITH_COVER_LABEL);
    return parseValueIntOr(value, CRAWL_PUSH_NOTIFICATION_WITH_COVER_DEFAULT_VALUE) === CRAWL_PUSH_NOTIFICATION_WITH_COVER.ENABLE;
}