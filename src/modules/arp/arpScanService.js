import apiMethod from '#constants/apiMethodConst.js';

const ARP_SCAN_HOST = 'http://192.168.31.90:28088';
const ARP_SCAN_DEFAULT_HEADERS = { 'Content-Type': 'application/json' };

const ARP_SCAN_API = {
    SERVERS: {
        method: apiMethod.GET,
        path: '/api/servers'
    },
    WAKE_ON_LAN: {
        method: apiMethod.POST,
        path: '/api/servers/wake'
    }
};

/**
 * 统一调用 ARP 服务，返回业务数据；失败时通过 __throwMessage 抛出。
 * apiOptions 支持 query、headers 以及 signal 等 fetch 选项。
 * data 在 GET/HEAD 请求中作为查询参数，其他方法中作为 JSON 请求体。
 */
async function fetchArpScanService(apiOptions, data) {
    const { method = apiMethod.GET, path, headers, query, ...fetchOptions } = apiOptions;
    const requestMethod = String(method).toUpperCase();
    const isQueryRequest = requestMethod === 'GET' || requestMethod === 'HEAD';
    const url = new URL(path, ARP_SCAN_HOST);
    const params = { ...query, ...(isQueryRequest ? data : {}) };
    for (const [key, value] of Object.entries(params)) {
        if (value == null) continue;
        url.searchParams.delete(key);
        for (const item of Array.isArray(value) ? value : [value]) {
            url.searchParams.append(key, String(item));
        }
    }

    const requestHeaders = new Headers(ARP_SCAN_DEFAULT_HEADERS);
    new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));
    const options = { ...fetchOptions, method: requestMethod, headers: requestHeaders };
    if (!isQueryRequest && data !== undefined) {
        options.body = JSON.stringify(data);
    }

    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        __throwMessage(error.message, -1);
    }

    let body;
    try {
        body = await response.json();
    } catch {
        __throwMessage(`ARP service returned invalid JSON (HTTP ${response.status}).`, -1);
    }

    if (!body || typeof body !== 'object' || typeof body.code !== 'number') {
        __throwMessage('ARP service returned an invalid response.', -1);
    }
    if (body.code !== 0) {
        __throwMessage(body.message, body.code);
    }
    if (!response.ok) {
        __throwMessage(body.message ?? `ARP service request failed (HTTP ${response.status}).`, -1);
    }
    return body.data;
}

export async function getWakeableServers() {
    return fetchArpScanService(ARP_SCAN_API.SERVERS);
}

export async function wakeOnLan(serverId) {
    return fetchArpScanService(ARP_SCAN_API.WAKE_ON_LAN, { id: serverId });
}