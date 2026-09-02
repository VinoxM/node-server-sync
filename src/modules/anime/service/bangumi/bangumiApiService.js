import axios, { AxiosError } from 'axios';
import { GetterContextSubscribe } from '#core/context/subscribe.js';

function resolveResponse(response) {
    return response.data;
}

function rejectError(ex) {
    if (ex instanceof AxiosError) {
        const url = ex.config?.url;
        const errorMessage = ex.cause || ex.message;
        const code = ex.code;
        __log.error(`[Bangumi Api] Call api failed: [${code}]${url}. Cause: ${errorMessage}`);
    } else {
        __log.error(`[Bangumi Api] Call api failed.`, ex?.message ?? ex);
    }
    return null;
}

const bangumiApiGetter = new GetterContextSubscribe('BangumiApi', () => {
    const proxy = __env.get('axios.proxy', {
        host: '127.0.0.1',
        port: 7890,
        protocol: "http"
    });
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    };
    const bangumiToken = __env.get('bangumi.token');
    if (bangumiToken) {
        headers.Authorization = `Bearer ${bangumiToken}`;
    }
    return axios.create({
        baseURL: 'https://api.bgm.tv',
        headers,
        proxy,
        timeout: 10000
    });
});

/**
 * Bangumi 官方 Open API 客户端接口封装
 */
export const bangumiApi = {
    /**
     * 根据放送日期范围分页检索动画条目
     * @param {[string, string]} dateRange - 放送起始与结束日期范围（如 `['2026-10-01', '2027-01-01']`）
     * @param {number} offset - 分页偏移量
     * @param {number} limit - 单页条数
     * @returns {Promise<{ total: number, limit: number, offset: number, data: any[] }|null>}
     */
    searchSubjects: (dateRange, offset, limit) => bangumiApiGetter.getValue().post(`/v0/search/subjects?limit=${limit}&offset=${offset}`, {
        filter: { tag: ['日本'], air_date: [`>=${dateRange[0]}`, `<${dateRange[1]}`], type: [2] }, nsfw: true
    }).then(resolveResponse).catch(rejectError),

    /**
     * 根据 Bangumi ID 获取条目详情
     * @param {number|string} subjectId - 条目 ID
     * @returns {Promise<any|null>}
     */
    getSubject: (subjectId) => bangumiApiGetter.getValue().get(`/v0/subjects/${subjectId}`).then(resolveResponse).catch(rejectError),

    /**
     * 根据 Bangumi ID 获取条目出场角色与声优列表
     * @param {number|string} subjectId - 条目 ID
     * @returns {Promise<Array<any>|null>}
     */
    getSubjectCharacters: (subjectId) => bangumiApiGetter.getValue().get(`/v0/subjects/${subjectId}/characters`).then(resolveResponse).catch(rejectError)
};