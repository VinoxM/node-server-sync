import axios, { AxiosError } from 'axios'
import { GetterContextSubscribe } from '../../../../core/context/subscribe.js'

function resolveResponse(response) {
    return response.data
}

function rejectError(ex) {
    if (ex instanceof AxiosError) {
        const url = ex.config.url
        const errorMessage = ex.cause || ex.message
        const code = ex.code
        __log.error(`[Bangumi Api] Call api failed: [${code}]${url}. Cause: ${errorMessage}`)
    } else {
        __log.error(`[Bangumi Api] Call api failed.`, ex.message ?? ex)
    }
    return null;
}

const bangumiApiGetter = new GetterContextSubscribe('BangumiApi', () => {
    const proxy = __env.get('axios.proxy', {
        host: '127.0.0.1',
        port: 7890,
        protocol: "http"
    })
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }
    const bangumiToken = __env.get('bangumi.token')
    if (bangumiToken) {
        headers.Authorization = `Bearer ${bangumiToken}`
    }
    return axios.create({
        baseURL: 'https://api.bgm.tv',
        headers,
        proxy,
        timeout: 10000
    })
})

export const bangumiApi = {
    searchSubjects: (dateRange, offset, limit) => bangumiApiGetter.getValue().post(`/v0/search/subjects?limit=${limit}&offset=${offset}`, {
        filter: { tag: ['日本'], air_date: [`>=${dateRange[0]}`, `<${dateRange[1]}`], type: [2] }, nsfw: true
    }).then(resolveResponse).catch(rejectError),
    getSubject: (subjectId) => bangumiApiGetter.getValue().get(`/v0/subjects/${subjectId}`).then(resolveResponse).catch(rejectError),
    getSubjectCharacters: (subjectId) => bangumiApiGetter.getValue().get(`/v0/subjects/${subjectId}/characters`).then(resolveResponse).catch(rejectError)
}