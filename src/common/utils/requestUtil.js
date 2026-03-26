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