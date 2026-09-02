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
        __log.error(`[Bilive Api] Call api failed: [${code}]${url}. Cause: ${errorMessage}`);
    } else {
        __log.error(`[Bilive Api] Call api failed.`, ex?.message ?? ex);
    }
}

/** BiliBili Live 官方直播接口常量 */
const BILIVE_API = {
    GET_ROOM_INFO: '/room/v1/Room/get_info'
};

const biliveInstance = axios.create({ baseURL: 'https://api.live.bilibili.com/' });

function resolveBiliResponse(response) {
    const url = response.config.url;
    const data = response.data;
    if (data.code === 0) {
        return data.data;
    } else {
        const errorMessage = data.msg || data.message;
        __log.error(`[Bilive Api] Call api success, response failed: ${url}. Cause: ${errorMessage}`);
        throw new Error(errorMessage);
    }
}

const biliveCall = {
    get: (api, params = {}, headers = {}) => biliveInstance.get(api, { params, headers }).then(resolveBiliResponse).catch(rejectError),
    post: (api, data = {}, headers = {}) => biliveInstance.post(api, data, { headers }).then(resolveBiliResponse).catch(rejectError),
};

/**
 * B站官方直播间信息查询 API 客户端
 */
export const biliveApi = {
    /**
     * 查询指定直播间详细信息
     * @param {string|number} roomId - 直播间 ID
     * @returns {Promise<any>}
     */
    getRoomInfo: async roomId => biliveCall.get(BILIVE_API.GET_ROOM_INFO, { room_id: roomId })
};

/** Bilive Record 录制器管理接口常量 */
const BILIVE_RECORD_API = {
    GET_ALL_ROOMS: '/api/room',
    GET_FILE_INFO: '/api/file'
};

const biliveRecordInstanceGetter = new GetterContextSubscribe('BiliveAuth', () => {
    const auth = __env.get('bilive.auth', {});
    const username = auth.username || 'mAou';
    const password = auth.password || 'mAou5820';
    const authorization = btoa(`${username}:${password}`);
    const host = __env.get('bilive.host', 'fedora');
    const port = __env.get('bilive.port', 20356);
    const protocol = port === 443 ? 'https' : 'http';
    return axios.create({ baseURL: `${protocol}://${host}:${port}`, headers: { Authorization: `Basic ${authorization}` } });
});

const biliveRecordCall = {
    get: (api, params = {}, headers = {}) => biliveRecordInstanceGetter.getValue().get(api, { params, headers }).then(resolveResponse).catch(rejectError),
    post: (api, data = {}, headers = {}) => biliveRecordInstanceGetter.getValue().post(api, data, { headers }).then(resolveResponse).catch(rejectError)
};

/**
 * B站录制器 (Bilive-Live-Recorder) 本地/远程服务 API 客户端
 */
export const biliveRecordApi = {
    /**
     * 获取录制器配置监控的全部直播间列表
     * @returns {Promise<any>}
     */
    getAllRooms: async () => biliveRecordCall.get(BILIVE_RECORD_API.GET_ALL_ROOMS),

    /**
     * 查询指定录制切片文件的详细信息
     * @param {string} filePath - 相对文件路径
     * @returns {Promise<any>}
     */
    getFilesInfo: async (filePath) => biliveRecordCall.get(BILIVE_RECORD_API.GET_FILE_INFO, { path: filePath })
};