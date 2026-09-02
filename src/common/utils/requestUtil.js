/**
 * 清理并标准化 IP 地址字符串（去除 IPv6 映射前缀 ::ffff: 及两端中括号）
 * @param {string} ip - 原始 IP 字符串
 * @returns {string|null} 标准化后的 IP 字符串或 null
 */
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

/**
 * 获取客户端真实 IP 地址（优先解析 x-forwarded-for 反向代理头，回退到 Socket 远程地址）
 * @param {import('express').Request} req - Express 请求对象
 * @returns {string} 客户端真实 IP 地址（若无法获取则返回 'Unknown'）
 */
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

/**
 * 从 Host 请求头中提取纯主机名（去除端口号与中括号）
 * @param {string} hostHeader - 原始 Host 请求头字符串
 * @returns {string} 提取出的主机名
 */
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

/**
 * 获取请求的目标 Host 主机名
 * @param {import('express').Request} req - Express 请求对象
 * @returns {string} 主机名字符串（若无法获取则返回 'Unknown'）
 */
export function getRequestHost(req) {
    if (!req) return 'Unknown'
    let host = req?.get?.('host') || req?.headers?.host || ''
    if (!host) {
        host = req?.headers?.['x-forwarded-host'] || ''
    }
    if (!host) return 'Unknown'
    return extractHostname(host) || 'Unknown'
}

/**
 * 从请求头中提取 Bearer Authorization Token 字符串
 * @param {import('express').Request} req - Express 请求对象
 * @returns {string} 提取出的 Token 字符串
 */
export function getRequestTokenHash(req) {
    return (req.headers?.['authorization'] ?? '').replace('Bearer ', '')
}

/**
 * 从请求头中提取客户端凭据（client-id 与 client-secret）
 * @param {import('express').Request} req - Express 请求对象
 * @returns {{ clientId: string, clientSecret: string }} 客户端凭据对象
 */
export function getRequestClientIdAndClientSecret(req) {
    const clientId = (req.headers?.['client-id'] ?? '')
    const clientSecret = (req.headers?.['client-secret'] ?? '')
    return {
        clientId, clientSecret
    }
}

/**
 * 将任意消息对象编码并分块转换为符合 SSE (Server-Sent Events) 格式的数据包数组
 * @param {any} message - 待发送的消息（对象、字符串或数值）
 * @returns {string[]} 符合 SSE 规范的 `data: ...\n\n` 格式分块字符串数组
 */
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