import axios from 'axios'

export const getUrlContent = (url, useProxy = true) => {
    return getUrlFull(url, useProxy).then(res => res.data);
}

export const getUrlFull = async (url, useProxy = true) => {
    const config = {};
    if (useProxy) {
        config.proxy = __env.get("axios.proxy", {
            host: '127.0.0.1',
            port: 7890,
            protocol: "http"
        })
    }
    return axios.get(url, config)
}

export const getRequestRealIp = (req) => {
    if (req) {
        const forwardKey = "X-Forwarded-For"
        const forwards = req?.get?.(forwardKey) || req?.headers?.[forwardKey.toLocaleLowerCase()] || '';
        if (forwards && forwards !== "") {
            return forwards.split(",")[0] || 'Unknown';
        }
    }
    return "Unknown";
}

export const getTokenHash = req => (req.headers?.['authorization'] ?? '').replace('Bearer ', '')