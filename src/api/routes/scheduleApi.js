import apiBodyConst from '#constants/apiBodyConst.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank } from '#utils/preCheckUtil.js';
import { defineRoutes } from '#utils/defineUtil.js';
import { cancelJob, emitJob, getScheduleSnapshots, startSchedule } from '#jobs/scheduleDispatcher.js';
import { NEED_AUTH_CLIENT, needAuthSingleClient } from '#common/constants/authorizationConst.js';

const { POST, GET } = apiMethodConst;
const { JOB_NAME } = apiBodyConst;

/** 获取定时任务调度模块通信秘钥 */
const needSecret = () => "mAou5820.schedule";

/**
 * 定时任务动态调度与运维控制路由模块 (`/schedule/*`)
 */
export default defineRoutes({
    basePath: "/schedule",

    /**
     * 重启/重新加载所有定时任务调度器
     */
    "/restartJobs": {
        method: POST,
        needSecret,
        callback: () => {
            return startSchedule();
        }
    },

    "/getJobSnapshots": {
        method: GET,
        needSecret,
        // needAuth: needAuthSingleClient.MANAGE,
        callback: () => getScheduleSnapshots()
    },

    /**
     * 停止/取消指定的定时任务
     * 请求体参数：{ jobName: string }
     */
    "/cancelJob": {
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, JOB_NAME),
        callback: (/** @type {ApiRequest} */ req) => {
            const jobName = req.body[JOB_NAME];
            return cancelJob(jobName);
        }
    },

    /**
     * 手动立即触发执行指定的定时任务
     * 请求体参数：{ jobName: string }
     */
    "/emitJob": {
        method: POST,
        needAuth: { clients: [NEED_AUTH_CLIENT.MANAGE, NEED_AUTH_CLIENT.API_POST] },
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, JOB_NAME),
        callback: (/** @type {ApiRequest} */ req) => {
            const jobName = req.body[JOB_NAME];
            return emitJob(jobName);
        }
    }
});