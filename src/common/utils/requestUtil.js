export function getRequestRealIp(req) {
    if (req) {
        const forwardKey = "X-Forwarded-For"
        const forwards = req?.get?.(forwardKey) || req?.headers?.[forwardKey.toLocaleLowerCase()] || '';
        if (forwards && forwards !== "") {
            return forwards.split(",")[0] || 'Unknown';
        }
    }
    return "Unknown";
}

export function getRequestHost(req) {
    if (req) {
        const hostKey = "host"
        const hosts = req?.get?.(hostKey) || req?.headers?.[hostKey.toLocaleLowerCase()] || '';
        if (hosts && hosts !== "") {
            return hosts.split(",")[0] || 'Unknown';
        }
    }
    return "Unknown";
}

export function getRequestTokenHash(req) {
    return (req.headers?.['authorization'] ?? '').replace('Bearer ', '')
}

export function getRequestClientIdAndClientSecret(req) {
    const clientId = (req.headers?.['client-id'] ?? '')
    const clientSecret = (req.headers?.['client-secret'] ?? '')
    return {
        clientId, clientSecret
    }
}

export function resolveStreamMessage(message) {
    let str = ''
    if (typeof message === 'string') {
        str = message
    } else if (typeof message === 'object') {
        str = JSON.stringify(message)
    } else if (typeof message === 'number') {
        str = message + ''
    }
    if (str === '') {
        return ['data: \n\n']
    }
    str = encodeURIComponent(str)
    str = Buffer.from(str, 'utf-8').toString('base64')
    let result = []
    const splitLen = 500
    const num = Math.ceil(str.length / splitLen)
    for (let i = 0; i < num; i++) {
        result.push(str.substring(i * splitLen, Math.min(str.length, (i + 1) * splitLen)))
    }
    return result.map((s, i) => `data: ${s}\n${num - i === 1 ? '\n' : ''}`)
}