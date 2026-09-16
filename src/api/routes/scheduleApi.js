import apiBodyConst from '#constants/apiBodyConst.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank } from '#utils/preCheckUtil.js';
import { defineRoutes } from '#utils/defineUtil.js';
import { abortJob, cancelJob, emitJob, getScheduleSnapshots, gracefulShutdownSchedule, startSchedule } from '#jobs/scheduleDispatcher.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';

const { POST, GET } = apiMethodConst;
const { JOB_NAME } = apiBodyConst;

/** 获取定时任务调度模块通信秘钥 */
const needSecret = () => "mAou5820.schedule";
const needAuth = needAuthSingleClient.MANAGE;

/**
 * 定时任务动态调度与运维控制路由模块 (`/schedule/*`)
 */
export default defineRoutes({
    basePath: "/schedule",

    /**
     * 重启/重新加载所有定时任务调度器
     */
    "/reloadJobs": {
        method: POST,
        needSecret,
        needAuth,
        callback: () => {
            return startSchedule();
        }
    },

    /**
     * 查询所有定时任务运行状态与指标快照
     */
    "/getJobSnapshots": {
        method: GET,
        needSecret,
        needAuth,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        callback: () => getScheduleSnapshots()
    },

    /**
     * 停止/取消指定的定时任务并注销
     * 请求体参数：{ jobName: string }
     */
    "/cancelJob": {
        method: POST,
        needSecret,
        needAuth,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, JOB_NAME),
        callback: (/** @type {ApiRequest} */ req) => {
            const jobName = req.body[JOB_NAME];
            return cancelJob(jobName);
        }
    },

    /**
     * 仅中断指定定时任务当前的单次执行（保留定时计划，不注销任务）
     * 请求体参数：{ jobName: string }
     */
    "/abortJob": {
        method: POST,
        needSecret,
        needAuth,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, JOB_NAME),
        callback: (/** @type {ApiRequest} */ req) => {
            const jobName = req.body[JOB_NAME];
            return abortJob(jobName);
        }
    },

    /**
     * 手动立即触发执行指定的定时任务
     * 请求体参数：{ jobName: string }
     */
    "/emitJob": {
        method: POST,
        needSecret,
        needAuth,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, JOB_NAME),
        callback: (/** @type {ApiRequest} */ req) => {
            const jobName = req.body[JOB_NAME];
            return emitJob(jobName);
        }
    }
});