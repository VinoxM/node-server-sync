import optionsRep from "../repository/optionsRep.js";

let CACHE_INITIALIZED = false;
const cache = new Map();

async function getOption(label = '') {
    if (__isBlank(label)) return null
    if (cache.has(label)) {
        return cache.get(label)
    }
    const option = await optionsRep.selectByLabel(label)
    if (option) {
        cache.set(option.label, option)
    }
    return option;
}

async function getOptionValue(label = '') {
    const option = await getOption(label)
    return option?.value
}

export async function updateOption(id, description, value) {
    const { rows } = await optionsRep.updateById(id, value, description)
    if (rows > 0) {
        const option = await optionsRep.selectById(id)
        cache.set(option.label, option)
    }
}

export async function getOptions() {
    if (CACHE_INITIALIZED) {
        return Array.from(cache.values())
    }
    const { rows, data } = await optionsRep.selectAll()
    if (rows > 0 && __isNotEmptyArray(data)) {
        cache.clear();
        data.forEach(p => cache.set(p.label, p))
    }
    CACHE_INITIALIZED = true;
    return data
}

function parseValueIntOr(value, defaultValue) {
    try {
        const result = parseInt(value ?? defaultValue)
        return isNaN(result) ? defaultValue : result
    } catch (error) {
        return defaultValue
    }
}

/** Media policy default allowed */
const MEDIA_POLICY_MODE_LABEL = 'MediaPolicyMode'
const MEDIA_POLICY_MODE = { NOT_ALLOWED: 0, ALLOWED: 1 }
const MEDIA_POLICY_MODE_DEFAULT_VALUE = MEDIA_POLICY_MODE.ALLOWED
export async function getMediaPolicyDefaultAllowed() {
    const value = await getOptionValue(MEDIA_POLICY_MODE_LABEL)
    return parseValueIntOr(value, MEDIA_POLICY_MODE_DEFAULT_VALUE) === MEDIA_POLICY_MODE.ALLOWED
}

/** Media upload timeout */
const MEDIA_UPLOAD_TIMEOUT_LABEL = 'MediaUploadTimeout'
const MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE = 5000
export async function getMediaUploadTimeoutOption() {
    const value = await getOptionValue(MEDIA_UPLOAD_TIMEOUT_LABEL)
    return parseValueIntOr(value, MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE)
}

/** Media safely delete storage */
const MEDIA_SAFELY_DELETE_STORAGE_LABEL = 'MediaSafelyDeleteStorage'
const MEDIA_SAFELY_DELETE_STORAGE = { UNSAFELY: 0, SAFELY: 1 }
const MEDIA_SAFELY_DELETE_STORAGE_DEFAULT_VALUE = MEDIA_SAFELY_DELETE_STORAGE.SAFELY
export async function getMediaSafelyDeleteStorage() {
    const value = await getOptionValue(MEDIA_SAFELY_DELETE_STORAGE_LABEL)
    return parseValueIntOr(value, MEDIA_SAFELY_DELETE_STORAGE_DEFAULT_VALUE) === MEDIA_SAFELY_DELETE_STORAGE.SAFELY
}

/** Media auto delete the stream file after successful upload  */
const MEDIA_AUTO_DELETE_STREAM_FILE_LABEL = "MediaAutoDeleteStreamFile"
const MEDIA_AUTO_DELETE_STREAM_FILE = { DISABLE: 0, ENABLE: 1 }
const MEDIA_AUTO_DELETE_STREAM_FILE_DEFAULT_VALUE = MEDIA_AUTO_DELETE_STREAM_FILE.DISABLE
export async function getMediaAutoDeleteStreamFile() {
    const value = await getOptionValue(MEDIA_AUTO_DELETE_STREAM_FILE_LABEL)
    return parseValueIntOr(value, MEDIA_AUTO_DELETE_STREAM_FILE_DEFAULT_VALUE) === MEDIA_AUTO_DELETE_STREAM_FILE.ENABLE
}

/** Push notification when bilive stream changed */
const PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_LABEL = "PushNotificationWhenBiliveStreamChanged"
const PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED = { DISABLE: 0, ENABLE: 1 }
const PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_DEFAULT_VALUE = PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED.DISABLE
export async function getPushNotificationWhenBiliveStreamChanged() {
    const value = await getOptionValue(PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_LABEL)
    return parseValueIntOr(value, PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED_DEFAULT_VALUE) === PUSH_NOTIFICATION_WHEN_BILIVE_STREAM_CHANGED.ENABLE
}

/** Convert bilive flv file to mp4 */
const CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_LABEL = "ConvertBiliveStreamFileFlvToMp4"
const CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4 = { DISABLE: 0, ENABLE: 1 }
const CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_DEFAULT_VALUE = CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4.DISABLE
export async function getConvertBiliveStreamFileFlvToMp4Option() {
    const value = await getOptionValue(CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_LABEL)
    return parseValueIntOr(value, CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4_DEFAULT_VALUE) === CONVERT_BILIVE_STREAM_FILE_FLV_TO_MP4.ENABLE
}

/** Delete author safely */
const DELETE_AUTHOR_SAFELY_LABEL = "DeleteAuthorSafely"
const DELETE_AUTHOR_SAFELY = { DISABLE: 0, ENABLE: 1 }
const DELETE_AUTHOR_SAFELY_DEFAULT_VALUE = DELETE_AUTHOR_SAFELY.ENABLE
export async function getDeleteAuthorSafely() {
    const value = await getOptionValue(DELETE_AUTHOR_SAFELY_LABEL)
    return parseValueIntOr(value, DELETE_AUTHOR_SAFELY_DEFAULT_VALUE) === DELETE_AUTHOR_SAFELY.ENABLE
}