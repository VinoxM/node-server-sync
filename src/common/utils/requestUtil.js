function cleanIpAddress(ip) {
    if (!ip || ip === 'Unknown') return null
    ip = ip.trim()
    if (ip.startsWith('[') && ip.includes(']')) {
        ip = ip.substring(1, ip.indexOf(']'))
    }
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7)
    }
    return ip
}

export function getRequestRealIp(req) {
    if (!req) return 'Unknown'
    const forwardKey = 'x-forwarded-for'
    let forwards = req.get?.(forwardKey) || req.headers?.[forwardKey] || ''
    if (!forwards) {
        forwards = req.get?.('X-Forwarded-For') || req.headers?.['X-Forwarded-For'] || ''
    }
    if (forwards && forwards !== '') {
        const firstIp = forwards.split(',')[0].trim()
        return cleanIpAddress(firstIp) || 'Unknown'
    }
    const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress || ''
    return cleanIpAddress(remoteAddr) || 'Unknown'
}

function extractHostname(hostHeader) {
    if (!hostHeader || typeof hostHeader !== 'string') return ''
    hostHeader = hostHeader.trim()
    const ipv6Match = hostHeader.match(/^\[(.*?)\](?::|$)/)
    if (ipv6Match) {
        return ipv6Match[1]
    }
    const parts = hostHeader.split(':')
    return parts[0] || ''
}

export function getRequestHost(req) {
    if (!req) return 'Unknown'
    let host = req?.get?.('host') || req?.headers?.host || ''
    if (!host) {
        host = req?.headers?.['x-forwarded-host'] || ''
    }
    if (!host) return 'Unknown'
    return extractHostname(host) || 'Unknown'
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