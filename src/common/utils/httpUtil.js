import axios from 'axios'

function getAxiosProxy() {
    return __env.get("axios.proxy", {
        host: '127.0.0.1',
        port: 7890,
        protocol: "http"
    })
}

export async function getUrlContent(url, useProxy = true) {
    return getUrlFull(url, useProxy).then(res => res.data);
}

export async function getUrlFull(url, useProxy = true) {
    const config = {};
    if (useProxy) {
        config.proxy = getAxiosProxy()
    }
    return axios.get(url, config)
}

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