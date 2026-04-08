import axios, { AxiosError } from 'axios'

const BILIVE_API = {
    GET_ROOM_INFO: '/room/v1/Room/get_info'
}

const biliveApi = axios.create({ baseURL: 'https://api.live.bilibili.com/' })

function resolveResponse(response) {
    const url = response.config.url
    const data = response.data
    if (data.code === 0) {
        return data.data
    } else {
        const errorMessage = data.msg || data.message
        __log.error(`[Bilive Api] Call api success, response failed: ${url}. Cause: ${errorMessage}`)
        throw new Error(errorMessage)
    }
}

function rejectError(ex) {
    if (ex instanceof AxiosError) {
        const url = ex.config.url
        const errorMessage = ex.cause || ex.message
        const code = ex.code
        __log.error(`[Bilive Api] Call api failed: [${code}]${url}. Cause: ${errorMessage}`)
    }
}

const callApi = {
    get: (api, params = {}, headers = {}) => biliveApi.get(api, { params, headers }).then(resolveResponse).catch(rejectError),
    post: (api, data = {}, headers = {}) => biliveApi.post(api, data, { headers }).then(resolveResponse).catch(rejectError),
}

export async function getRoomInfo(roomId) {
    return callApi.get(BILIVE_API.GET_ROOM_INFO, { room_id: roomId })
}