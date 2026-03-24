import { getAria2Socket } from "../../instance/aria2Socket.js";

async function addTask(url, options) {
    const gid = await getAria2Socket().addUri(url, options)
    return getAria2Socket().getInfo(gid);
}

async function getTaskInfo(gid) {
    return getAria2Socket().getInfo(gid);
}

async function removeTask(gid) {
    await getAria2Socket().remove(gid).catch(ex => __log.error(`Remove aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

async function getTaskMultiStatus(gidArr) {
    return getAria2Socket().getMultiStatus(gidArr).catch(ex => __log.error(`Get aria2 task multi status failed.`, ex?.message, ex?.response?.data || ''));
}

async function pauseTask(gid) {
    await getAria2Socket().pause(gid).catch(ex => __log.error(`Pause aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

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
}