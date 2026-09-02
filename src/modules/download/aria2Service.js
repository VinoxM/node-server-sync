import { getAria2Socket } from "#core/instance/aria2Socket.js";

/**
 * @typedef {import('@types/downloadTypes.d.ts').Aria2TaskOption} Aria2TaskOption
 * @typedef {import('@types/downloadTypes.d.ts').Aria2TaskStatus} Aria2TaskStatus
 */

/**
 * 添加单个下载任务并返回该任务的初始状态详情
 * @param {string|string[]} url - 下载目标 URL (支持 HTTP/HTTPS/FTP 或磁力链接)
 * @param {Aria2TaskOption} [options] - 附加下载选项 (如 dir, out, header 等)
 * @returns {Promise<Aria2TaskStatus>} 任务状态详情
 */
async function addTask(url, options) {
    const gid = await getAria2Socket().addUri(url, options);
    return getAria2Socket().getInfo(gid);
}

/**
 * 查询指定 GID 任务的状态信息
 * @param {string} gid - 任务 GID
 * @returns {Promise<Aria2TaskStatus>} 任务状态详情
 */
async function getTaskInfo(gid) {
    return getAria2Socket().getInfo(gid);
}

/**
 * 移除/删除指定的下载任务
 * @param {string} gid - 任务 GID
 * @returns {Promise<void>}
 */
async function removeTask(gid) {
    await getAria2Socket().remove(gid).catch(ex => __log.error(`Remove aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

/**
 * 批量查询多个 GID 任务的状态信息列表 (利用 system.multicall)
 * @param {string[]} gidArr - GID 数组
 * @returns {Promise<Aria2TaskStatus[]>} 任务状态列表
 */
async function getTaskMultiStatus(gidArr) {
    return getAria2Socket().getMultiStatus(gidArr).catch(ex => __log.error(`Get aria2 task multi status failed.`, ex?.message, ex?.response?.data || ''));
}

/**
 * 暂停指定 GID 的下载任务
 * @param {string} gid - 任务 GID
 * @returns {Promise<void>}
 */
async function pauseTask(gid) {
    await getAria2Socket().pause(gid).catch(ex => __log.error(`Pause aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

/**
 * 恢复/继续指定 GID 的下载任务
 * @param {string} gid - 任务 GID
 * @returns {Promise<void>}
 */
async function resumeTask(gid) {
    await getAria2Socket().resume(gid).catch(ex => __log.error(`Resume aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

export default {
    addTask,
    getTaskInfo,
    removeTask,
    getTaskMultiStatus,
    pauseTask,
    resumeTask
};