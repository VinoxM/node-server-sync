import { MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE, MEDIA_UPLOAD_TIMEOUT_LABEL } from "../constants/mediaConst.js";
import optionsRep from "../repository/optionsRep.js";

let CACHE_INITIALIZED = false;
const cache = new Map();

export async function getOption(label = '') {
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

export async function getOptionValue(label = '') {
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

export async function getMediaUploadTimeoutOption() {
    const value = await getOptionValue(MEDIA_UPLOAD_TIMEOUT_LABEL)
    try {
        const result = parseInt(value ?? MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE)
        return isNaN(result) ? MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE : result
    } catch (error) {
        return MEDIA_UPLOAD_TIMEOUT_DEFAULT_VALUE
    }
}