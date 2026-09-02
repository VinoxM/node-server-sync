/**
 * 从多层嵌套的对象中按路径表达式获取属性值
 * @template T, D
 * @param {any} object - 目标对象
 * @param {string} key - 点分/数组下标路径表达式 (例如 "user.profile.name" 或 "list[0].id")
 * @param {D} [defaultValue] - 当路径不存在或值为 null/undefined 时的默认返回值
 * @returns {T|D} 属性值或默认值
 */
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

/**
 * 根据点分/数组路径在嵌套对象中设置指定的值（自动补全中间不存在的对象或数组）
 * @param {Record<string, any>} json - 目标对象
 * @param {string} key - 点分/数组下标路径表达式 (例如 "a.b.c" 或 "items[2].name")
 * @param {any} value - 要设置的值
 */
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

/**
 * 深度合并 source 对象的属性到 target 对象中
 * @param {Record<string, any>} target - 目标对象（会被直接修改）
 * @param {Record<string, any>} source - 源对象
 */
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

/**
 * 判断值是否为普通纯对象 (Plain Object) 或数组
 * @param {any} value - 待检测的值
 * @returns {boolean} 是否为纯对象或数组
 */
function isPlainObjectOrArray(value) {
    if (Array.isArray(value)) {
        return true;
    }
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    if (Object.prototype.toString.call(value) !== '[object Object]') {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto === null) {
        return true;
    }
    const Ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor;
    return typeof Ctor === 'function' && Ctor === Object;
}

/**
 * 尝试对纯对象或数组进行深拷贝 (基于 structuredClone)
 * @template T
 * @param {T} obj - 待克隆的目标
 * @returns {T} 克隆出的新对象，若无法克隆或非纯对象则返回原值
 */
export function tryClone(obj) {
    if (!isPlainObjectOrArray(obj)) {
        return obj
    }
    try {
        return structuredClone(obj)
    } catch {
        return obj
    }
}