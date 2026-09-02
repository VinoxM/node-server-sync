import { getItem } from "./objectUtil.js";

const defaultPrint = false;

const validator = {
    equals: (data, expect) => validator.notNull(data) && data === expect,
    notBlank: data => !__isBlank(data),
    notEmpty: data => !__isEmptyArray(data),
    notNull: data => data !== undefined && data !== null,
    notUndefined: data => data !== undefined,
    pattern: (data, matchers) => __isBlank(data) || (!__isEmptyArray(matchers) && Array.from(matchers).every(m => new RegExp(m).test(data))),
    fileExists: file => file?.data && file?.data?.length > 0
}

const dataFrom = {
    headers: (request, headerKey) => request.headers[String(headerKey).toLocaleLowerCase()],
    query: (request, queryKey) => request.query?.[queryKey],
    body: (request, bodyKey) => getItem(request.body ?? {}, bodyKey, null),
    files: (request, fileKey) => request?.files?.filter?.(file => file.field === fileKey)?.[0] ?? null
}

/**
 * 通用请求参数校验核心方法
 * @param {import('express').Request} request - Express 请求对象
 * @param {{
 *   from: 'headers'|'query'|'body'|'files',
 *   valid: 'equals'|'notBlank'|'notEmpty'|'notNull'|'notUndefined'|'pattern'|'fileExists',
 *   key: string|string[],
 *   args?: any[],
 *   print?: boolean,
 *   infoMessage?: string,
 *   errorMessage?: string,
 *   errorCode?: number,
 *   errorStatus?: number,
 *   throwable?: boolean
 * }} options - 校验配置项
 * @returns {boolean} 校验通过返回 true，若 throwable=false 且校验失败则返回 false
 */
function requestValidate(request, options) {
    const { from, valid, key, args = [], print = defaultPrint, infoMessage, errorMessage, errorCode = -3, errorStatus = 400, throwable = true } = options
    if (from in dataFrom && valid in validator) {
        let keys = Array.isArray(key) ? key : [key]
        if (print) {
            __log.debug(`[Request Validate] ${request.method}:${request.url} -> ${infoMessage}: ${keys.join(',')}`)
        }
        const errKeys = []
        for (const k of keys) {
            const data = dataFrom[from](request, k)
            if (!validator[valid](data, ...args)) {
                errKeys.push(k)
            }
        }
        if (errKeys.length > 0) {
            if (!throwable) return false
            __throwMessage(`${errorMessage}: ${errKeys.join(',')}`, errorCode, errorStatus);
        }
    } else {
        __throwMessage(`Request validate options error.`, -10, errorStatus);
    }
    return true
}

// ==================== Header 校验 ====================

/**
 * 校验请求头中指定 Key 的值是否与期望值完全相等
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} headerKey - 请求头 Key 名
 * @param {string} expectValue - 期望的 Header 值
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkHeaderKeyValue = (request, headerKey, expectValue, opts = {}) => requestValidate(request, {
    from: 'headers', valid: 'equals', key: headerKey, args: [expectValue],
    infoMessage: 'header key',
    errorMessage: 'Request header verification failed',
    errorCode: -2,
    ...opts
})

/**
 * 校验请求头中指定 Key 是否非空/非空白
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} headerKey - 请求头 Key 名
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkHeaderKeyNotBlank = (request, headerKey, opts = {}) => requestValidate(request, {
    from: 'headers', valid: 'notBlank', key: headerKey,
    infoMessage: 'header key not blank',
    errorMessage: 'Request header is blank',
    errorCode: -2,
    ...opts
})

/**
 * 校验请求头中指定 Key 若存在时是否满足正则规则
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} headerKey - 请求头 Key 名
 * @param {string[]|RegExp[]} matchers - 正则表达式或字符串数组
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkHeaderKeyMatchIfPresent = (request, headerKey, matchers, opts = {}) => requestValidate(request, {
    from: 'headers', valid: 'pattern', key: headerKey, args: [matchers],
    infoMessage: 'header key match',
    errorMessage: 'Request header verification failed',
    errorCode: -2,
    ...opts
})

// ==================== Query 校验 ====================

/**
 * 校验 URL Query 查询参数中指定 Key 是否非空/非空白
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} queryKey - Query 参数名
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkQueryKeyNotBlank = (request, queryKey, opts = {}) => requestValidate(request, {
    from: 'query', valid: 'notBlank', key: queryKey,
    infoMessage: 'query key not blank',
    errorMessage: 'Request query is blank',
    ...opts
})

/**
 * 校验 URL Query 查询参数中指定 Key 若存在时是否匹配正则规则
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} queryKey - Query 参数名
 * @param {string[]|RegExp[]} matchers - 正则表达式或字符串数组
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkQueryKeyMatchIfPresent = (request, queryKey, matchers, opts = {}) => requestValidate(request, {
    from: 'query', valid: 'pattern', key: queryKey, args: [matchers],
    infoMessage: 'query key match',
    errorMessage: 'Request query is unsupported',
    ...opts
})

/**
 * 校验 URL Query 查询参数中指定 Key 的值是否等于期望值
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} queryKey - Query 参数名
 * @param {string} expectValue - 期望值
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkQueryKeyValue = (request, queryKey, expectValue, opts = {}) => requestValidate(request, {
    from: 'query', valid: 'equals', key: queryKey, args: [expectValue],
    infoMessage: 'query key value',
    errorMessage: 'Request query verification failed',
    ...opts
})

// ==================== Body 校验 ====================

/**
 * 校验请求体中指定 Key 是否为非空数组
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} bodyKey - 请求体字段路径 (支持嵌套)
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkBodyKeyNotEmptyArray = (request, bodyKey, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notEmpty', key: bodyKey,
    infoMessage: 'body key not empty array',
    errorMessage: 'Request body is empty array',
    ...opts
})

/**
 * 校验请求体中指定 Key 是否非空/非空白
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} bodyKey - 请求体字段路径 (支持嵌套)
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkBodyKeyNotBlank = (request, bodyKey, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notBlank', key: bodyKey,
    infoMessage: 'body key not blank',
    errorMessage: 'Request body is blank',
    ...opts
})

/**
 * 校验请求体中指定 Key 的值是否匹配给定的正则表达式
 * @param {import('express').Request} request - Express 请求对象
 * @param {string} bodyKey - 请求体字段路径 (支持嵌套)
 * @param {string[]|RegExp[]} matchers - 正则表达式或字符串数组
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkBodyKeyMatch = (request, bodyKey, matchers, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'pattern', key: bodyKey, args: [matchers],
    infoMessage: 'body key match',
    errorMessage: 'Request body is unsupported',
    ...opts
})

/**
 * 批量校验请求体中多个 Key 是否均非空/非空白
 * @param {import('express').Request} request - Express 请求对象
 * @param {string|string[]} bodyKeys - 请求体字段名数组或单个字段名
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkBodyKeysNotBlank = (request, bodyKeys, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notBlank', key: bodyKeys,
    infoMessage: 'body keys not blank',
    errorMessage: 'Request body is blank',
    ...opts
})

/**
 * 批量校验请求体中多个 Key 是否均非 null 与 undefined
 * @param {import('express').Request} request - Express 请求对象
 * @param {string|string[]} bodyKeys - 请求体字段名数组或单个字段名
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkBodyKeysNotNull = (request, bodyKeys, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notNull', key: bodyKeys,
    infoMessage: 'body keys not null',
    errorMessage: 'Request body is null',
    ...opts
})

/**
 * 批量校验请求体中多个 Key 是否均已定义 (not undefined)
 * @param {import('express').Request} request - Express 请求对象
 * @param {string|string[]} bodyKeys - 请求体字段名数组或单个字段名
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkBodyKeysExists = (request, bodyKeys, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notUndefined', key: bodyKeys,
    infoMessage: 'body keys exists',
    errorMessage: 'Request body not exists',
    ...opts
})

/**
 * 校验上传的文件中指定字段名的文件是否存在且非空
 * @param {import('express').Request} request - Express 请求对象
 * @param {string|string[]} fileKeys - 文件字段名数组或单个字段名
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkBodyFilesNotEmpty = (request, fileKeys, opts = {}) => requestValidate(request, {
    from: 'files', valid: 'fileExists', key: fileKeys,
    infoMessage: 'files exists',
    errorMessage: 'Request files not exists',
    ...opts
})

/**
 * 校验内部请求头签名密钥（根据 `inside` 标识选择验证外部密钥还是内部专用密钥）
 * @param {import('express').Request} req - Express 请求对象
 * @param {string} secret - 外部通用通信密钥
 * @param {string} insideSecret - 内部专用通信密钥
 * @param {Record<string, any>} [opts] - 附加校验选项
 * @returns {boolean} 校验结果
 */
export const checkHeaderInside = (req, secret, insideSecret, opts = {}) => {
    checkHeaderKeyNotBlank(req, 'inside')
    checkHeaderKeyMatchIfPresent(req, 'inside', ['[0|1]'])
    if (parseInt(req.headers['inside']) === 0) {
        return checkHeaderKeyValue(req, 'secret', btoa(secret))
    } else {
        return checkHeaderKeyValue(req, 'secret', btoa(insideSecret))
    }
}