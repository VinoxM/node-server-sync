import axios from 'axios'

/**
 * 获取全局配置的 Axios HTTP 代理设置
 * @returns {{ host: string, port: number, protocol: string }} 代理配置对象
 */
function getAxiosProxy() {
    return __env.get("axios.proxy", {
        host: '127.0.0.1',
        port: 7890,
        protocol: "http"
    })
}

/**
 * 发送 GET 请求并直接返回响应数据体 (res.data)
 * @template T
 * @param {string} url - 目标 URL
 * @param {boolean} [useProxy=true] - 是否使用配置的 HTTP 代理
 * @returns {Promise<T>} 响应数据
 */
export async function getUrlContent(url, useProxy = true) {
    return getUrlFull(url, useProxy).then(res => res.data);
}

/**
 * 发送 GET 请求并返回完整的 Axios 响应对象
 * @param {string} url - 目标 URL
 * @param {boolean} [useProxy=true] - 是否使用配置的 HTTP 代理
 * @returns {Promise<import('axios').AxiosResponse>} Axios 响应对象
 */
export async function getUrlFull(url, useProxy = true) {
    const config = {};
    if (useProxy) {
        config.proxy = getAxiosProxy()
    }
    return axios.get(url, config)
}

/**
 * 发送 HEAD 请求检测目标 URL 内容大小是否大于 1MB
 * @param {string} url - 目标 URL
 * @returns {Promise<boolean>} 大于 1MB、无法获取大小或请求失败时返回 true，否则返回 false
 */
export async function urlContentLengthLargeThanOneMB(url) {
    try {
        const response = await axios.head(url, {
            timeout: 2000,
            proxy: getAxiosProxy()
        });
        const size = response.headers['content-length'];
        if (!size) return true
        const ONE_MB = 1024n * 1024n;
        return BigInt(size) > ONE_MB;
    } catch (error) {
        console.error('Fetch Size Failed:', error.message);
        return true;
    }
}