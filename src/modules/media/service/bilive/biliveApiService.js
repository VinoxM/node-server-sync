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
        __log.error(`[Bilive Api] Call api failed: [${code}]${url}. Cause: ${errorMessage}`)
    } else {
        __log.error(`[Bilive Api] Call api failed.`, ex.message ?? ex)
    }
}

/** BiliBili Live */
const BILIVE_API = {
    GET_ROOM_INFO: '/room/v1/Room/get_info'
}

const biliveInstance = axios.create({ baseURL: 'https://api.live.bilibili.com/' })

function resolveBiliResponse(response) {
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

const biliveCall = {
    get: (api, params = {}, headers = {}) => biliveInstance.get(api, { params, headers }).then(resolveBiliResponse).catch(rejectError),
    post: (api, data = {}, headers = {}) => biliveInstance.post(api, data, { headers }).then(resolveBiliResponse).catch(rejectError),
}

export const biliveApi = {
    getRoomInfo: async roomId => biliveCall.get(BILIVE_API.GET_ROOM_INFO, { room_id: roomId })
}

/** Bilive Record */
const BILIVE_RECORD_API = {
    GET_ALL_ROOMS: '/api/room',
    GET_FILE_INFO: '/api/file'
}

const biliveRecordInstanceGetter = new GetterContextSubscribe('BiliveAuth', () => {
    const auth = __env.get('bilive.auth', {})
    const username = auth.username || 'mAou'
    const password = auth.password || 'mAou5820'
    const authorization = btoa(`${username}:${password}`)
    const host = __env.get('bilive.host', 'fedora')
    const port = __env.get('bilive.port', 20356)
    const protocol = port === 443 ? 'https' : 'http'
    return axios.create({ baseURL: `${protocol}://${host}:${port}`, headers: { Authorization: `Basic ${authorization}` } })
})

const biliveRecordCall = {
    get: (api, params = {}, headers = {}) => biliveRecordInstanceGetter.getValue().get(api, { params, headers }).then(resolveResponse).catch(rejectError),
    post: (api, data = {}, headers = {}) => biliveRecordInstanceGetter.getValue().post(api, data, { headers }).then(resolveResponse).catch(rejectError)
}

export const biliveRecordApi = {
    getAllRooms: async () => biliveRecordCall.get(BILIVE_RECORD_API.GET_ALL_ROOMS),
    getFilesInfo: async (filePath) => biliveRecordCall.get(BILIVE_RECORD_API.GET_FILE_INFO, { path: filePath })
}