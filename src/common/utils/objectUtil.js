export function getItem(object, key, defaultValue) {
    if (object === undefined || object === null || typeof key !== 'string') {
        return defaultValue;
    }
    const keys = key.replace(/\[(\d+)]/g, '.$1').split('.').filter(Boolean);
    let result = object;
    for (const key of keys) {
        if (result === null || result === undefined) {
            return defaultValue;
        }
        if (key in Object(result)) {
            result = result[key];
        } else {
            return defaultValue;
        }
    }
    return result;
}

export function setItem(json, key, value) {
    if (!json || typeof key !== 'string' || key.trim() === '') return;
    const keys = key.replace(/\[(\d+)]/g, '.$1').split('.').filter(Boolean);
    const finalIndex = keys.length - 1;
    let current = json;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const isLast = (i === finalIndex);
        const nextKey = keys[i + 1];
        const isNextArray = nextKey !== undefined && /^\d+$/.test(nextKey);
        if (isLast) {
            current[k] = value;
        } else {
            const currentValue = current[k];
            if (currentValue === undefined) {
                current[k] = isNextArray ? [] : {};
            } else {
                const isCurrentArray = Array.isArray(currentValue);
                if (isNextArray && !isCurrentArray) {
                    return;
                }
                if (!isNextArray && (typeof currentValue !== 'object' || currentValue === null || isCurrentArray)) {
                    return;
                }
            }
            if (Array.isArray(current[k]) && isNextArray) {
                const targetIdx = parseInt(nextKey, 10);
                for (let j = current[k].length; j < targetIdx; j++) {
                    current[k][j] = null;
                }
            }
            current = current[k];
        }
    }
}

export function mergeObject(target, source) {
    if (!source || typeof source !== 'object') return;
    Object.keys(source).forEach(key => {
        const sourceValue = source[key];
        const targetValue = target[key];
        if (typeof sourceValue === 'undefined') return;
        if (sourceValue === null || typeof sourceValue !== 'object') {
            target[key] = sourceValue;
            return;
        }
        if (Array.isArray(sourceValue)) {
            target[key] = [...sourceValue];
            return;
        }
        if (typeof targetValue !== 'object' || targetValue === null || Array.isArray(targetValue)) {
            target[key] = {};
        }
        mergeObject(target[key], sourceValue);
    });
}

export function isPrimitive(obj) {
    if (obj === null || obj === undefined) {
        return true
    }
    return typeof obj !== 'object' && typeof obj !== 'function'
}

function canBeCloned(obj) {
    if (obj === null || obj === undefined) {
        return false
    }
    const tp = typeof obj
    return !['function', 'object'].includes(tp)
}

export function tryClone(obj) {
    return canBeCloned(obj) ? structuredClone(obj) : obj;
}