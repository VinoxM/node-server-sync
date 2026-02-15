export function getItem(object, key) {
    const json = object
    if (json === null) throw new Error('File not exists.')
    if (!key || typeof key !== 'string' || key.trim().length === 0) throw new Error()
    const keys = key.split('.')
    const finalIndex = keys.length - 1
    let lastObjectRef;
    let result = null;
    keys.reduce((obj, k, curIndex) => {
        if (!/^([0-9a-zA-Z_-])+(\[\d+])+|^([0-9a-zA-Z_-])+$/.test(k)) throw new Error()
        let realKey;
        if (obj === null || (realKey = /^([0-9a-zA-Z_-]+)/.exec(k)?.[0], !realKey)) throw new Error();
        if (/\[(\d+)]?/g.test(k)) {
            obj = obj[realKey];
            let regArr = null;
            let lastObj = obj;
            let lastIndex = -1;
            const reg = new RegExp(/\[(\d+)]?/g);
            while ((regArr = reg.exec(k)) !== null) {
                // 当前属性不是数组,抛出异常
                if (!Array.isArray(obj)) throw new Error();
                // 获取数组下标
                let index = Number(regArr[1])
                if (index > -1) {
                    if (obj.length <= index) throw new Error(); // 下标越界,抛出异常
                    // 缓存当前属性和其下标
                    lastIndex = index
                    lastObj = obj
                    obj = obj[index]
                } else throw new Error(); // 下标获取失败,抛出异常
            }
            if (curIndex === finalIndex) {
                result = lastObj[lastIndex]
            }
        } else {
            // 对象处理
            if (!obj.hasOwnProperty(realKey)) throw new Error();
            lastObjectRef = obj;
            obj = obj[realKey]
            if (curIndex === finalIndex) {
                result = lastObjectRef[realKey]
            }
        }
        return obj
    }, json)
    return result;
}

export function getItemOrElse(object, key, defaultValue) {
    try {
        return getItem(object, key)
    } catch (ignore) {
        return defaultValue ?? null
    }
}

export function setItem(json, key, value) {
    if (!key || typeof key !== 'string' || key.trim().length === 0) return
    const keys = key.split('.')
    const finalIndex = keys.length - 1
    let lastObjectRef;
    let lastRealKey;
    keys.reduce((obj, k, curIndex) => {
        if (!/^([0-9a-zA-Z_-])+(\[\d+])+|^([0-9a-zA-Z_-])+$/.test(k)) throw new Error();
        let realKey;
        if ((realKey = /^([0-9a-zA-Z_-]+)/.exec(k)?.[0], !realKey)) throw new Error();
        if (/\[(\d+)]?/g.test(k)) {
            if (obj === null || obj === undefined) {
                lastObjectRef[lastRealKey] = []
                obj = lastObjectRef[lastRealKey]
            }
            // 数组处理. exp: key[1]
            if (!obj.hasOwnProperty(realKey)) {
                obj[realKey] = []
            }
            obj = obj[realKey];
            let regArr = null;
            let lastObj = obj;
            let lastIndex = -1;
            const reg = new RegExp(/\[(\d+)]?/g);
            while ((regArr = reg.exec(k)) !== null) {
                // 当前属性不是数组,抛出异常
                if (!Array.isArray(obj)) throw new Error();
                // 获取数组下标
                let index = Number(regArr[1])
                if (index > -1) {
                    // 当前属性不存在,则初始化
                    if (lastIndex > -1 && obj === null) {
                        lastObj[lastIndex] = []
                        obj = lastObj[lastIndex]
                    }
                    // 下标越界,则填充数组至边界
                    if (obj.length <= index) {
                        let i = obj.length
                        while (i <= index) {
                            obj[i] = null
                            i++
                        }
                    }
                    // 缓存当前属性和其下标
                    lastIndex = index
                    lastObj = obj
                    obj = obj[index]
                } else throw new Error(); // 下标获取失败,抛出异常
            }
            if (curIndex === finalIndex) {
                lastObj[lastIndex] = value
            }
        } else {
            if (obj === null || obj === undefined) {
                lastObjectRef[lastRealKey] = {}
                obj = lastObjectRef[lastRealKey]
            }
            // 对象处理
            if (!obj.hasOwnProperty(realKey)) {
                obj[realKey] = {}
            }
            lastObjectRef = obj;
            obj = obj[realKey]
            if (curIndex === finalIndex) {
                lastObjectRef[realKey] = value
            }
        }
        lastRealKey = realKey
        return obj
    }, json)
}

export function setItemSilently(json, key, value) {
    try {
        setItem(json, key, value)
    } catch (ignore) {
    }
}

export function mergeObject(target, source) {
    Object.keys(source).forEach(key => {
        const value = source[key]
        if (typeof value === 'undefined') {
            return
        }
        if (typeof value === 'object') {
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = value
            } else if (Array.isArray(value)) {
                target[key] = value
            } else if (!Array.isArray(target[key])) {
                mergeObject(target[key], value)
            }
        } else {
            target[key] = value
        }
    })
}