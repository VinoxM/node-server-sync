import { getItemOrElse } from "./objectUtil.js";

const defaultPrint = false;

const validator = {
    equals: (data, expect) => validator.notNull(data) && data === expect,
    notBlank: data => !isBlank(data),
    notEmpty: data => !isEmptyArray(data),
    notNull: data => data !== undefined && data !== null,
    pattern: (data, matchers) => isBlank(data) || (!isEmptyArray(matchers) && Array.from(matchers).every(m => new RegExp(m).test(data))),
    fileExists: file => file?.data && file?.data?.length > 0
}

const dataFrom = {
    headers: (request, headerKey) => request.headers[String(headerKey).toLocaleLowerCase()],
    query: (request, queryKey) => request.query?.[queryKey],
    body: (request, bodyKey) => getItemOrElse(request.body ?? {}, bodyKey, null),
    files: (request, fileKey) => request?.files?.filter?.(file => file.field === fileKey)?.[0] ?? null
}

function requestValidate(request, options) {
    const { from, valid, key, args = [], print = defaultPrint, infoMessage, errorMessage, errorCode = -3, errorStatus = 200 } = options
    if (from in dataFrom && valid in validator) {
        let keys = Array.isArray(key) ? key : [key]
        if (print) {
            logger(`[Request Validate] ${request.method}:${request.url} -> ${infoMessage}: ${keys.join(',')}`)
        }
        const errKeys = []
        for (const k of keys) {
            const data = dataFrom[from](request, k)
            if (!validator[valid](data, ...args)) {
                errKeys.push(k)
            }
        }
        if (errKeys.length > 0) {
            throwMessage(`${errorMessage}: ${errKeys.join(',')}`, errorCode, errorStatus);
        }
    } else {
        throwMessage(`Request validate options error.`, -10, errorStatus);
    }
    return true
}

// header
export const checkHeaderKeyValue = (request, headerKey, expectValue, opts = {}) => requestValidate(request, {
    from: 'headers', valid: 'equals', key: headerKey, args: [expectValue],
    infoMessage: 'header key',
    errorMessage: 'Request header verification failed',
    errorCode: -2,
    ...opts
})

// query
export const checkQueryKeyNotBlank = (request, queryKey, opts = {}) => requestValidate(request, {
    from: 'query', valid: 'notBlank', key: queryKey,
    infoMessage: 'query key not blank',
    errorMessage: 'Request query is blank',
    ...opts
})

export const checkQueryKeyMatchIfPresent = (request, queryKey, matchers, opts = {}) => requestValidate(request, {
    from: 'query', valid: 'pattern', key: queryKey, args: [matchers],
    infoMessage: 'query key match',
    errorMessage: 'Request query is unsupported',
    ...opts
})

export const checkQueryKeyValue = (request, queryKey, expectValue, opts = {}) => requestValidate(request, {
    from: 'query', valid: 'equals', key: queryKey, args: [expectValue],
    infoMessage: 'query key value',
    errorMessage: 'Request query verification failed',
    ...opts
})

// body
export const checkBodyKeyNotEmptyArray = (request, bodyKey, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notEmpty', key: bodyKey,
    infoMessage: 'body key not empty array',
    errorMessage: 'Request body is empty array',
    ...opts
})

export const checkBodyKeyNotBlank = (request, bodyKey, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notBlank', key: bodyKey,
    infoMessage: 'body key not blank',
    errorMessage: 'Request body is blank',
    ...opts
})

export const checkBodyKeyMatch = (request, bodyKey, matchers, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'pattern', key: bodyKey, args: [matchers],
    infoMessage: 'body key match',
    errorMessage: 'Request body is unsupported',
    ...opts
})

export const checkBodyKeysNotBlank = (request, bodyKeys, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notBlank', key: bodyKeys,
    infoMessage: 'body keys not blank',
    errorMessage: 'Request body is blank',
    ...opts
})

export const checkBodyKeysExists = (request, bodyKeys, opts = {}) => requestValidate(request, {
    from: 'body', valid: 'notNull', key: bodyKeys,
    infoMessage: 'body keys exists',
    errorMessage: 'Request body not exists',
    ...opts
})

export const checkBodyFilesNotEmpty = (request, fileKeys, opts = {}) => requestValidate(request, {
    from: 'files', valid: 'fileExists', key: fileKeys,
    infoMessage: 'files exists',
    errorMessage: 'Request files not exists',
    ...opts
})