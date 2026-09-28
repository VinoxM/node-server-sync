import aria2Service from "#modules/download/aria2Service.js";
import { MEDIA_ARIA2_TASK_STATUS, MEDIA_MINIO_STATUS } from "../constants/mediaConst.js";
import aria2TaskRep from "../repository/aria2TaskRep.js";
import videoMinioRep from "../repository/videoMinioRep.js";
import { pushNotification } from "#api/sockets/notification.js";
import { addTask, pauseOrResumeTask, getTaskInfoAndDownloadStatus, removeTask as removeAria2Task } from "./minio/mediaAria2TaskService.js";
import { transitionMinioStatus, cancelMinioRetry, MINIO_STATUS_SOURCE } from "./minio/mediaMinioStateService.js";

// 兼容再导出：aria2 任务原子操作已下沉至 mediaAria2TaskService，保持对外导入路径不变
export { addTask, pauseOrResumeTask, getTaskInfoAndDownloadStatus };

/**
 * 移除指定的 Aria2 任务并清理本地临时文件
 * 清理动作导致的 FAILED 不应触发自动重试，因此此处联动取消已排期的重试。
 * @param {number} taskId - aria2_task 主键 ID
 * @returns {Promise<void>}
 */
export async function removeTask(taskId) {
    const minioId = await removeAria2Task(taskId);
    __isNotBlank(minioId) && cancelMinioRetry(minioId);
}

const CAN_UPDATE_ARIA2_TASK_STATUS = [
    MEDIA_ARIA2_TASK_STATUS.COMPLETE,
    MEDIA_ARIA2_TASK_STATUS.FAILED,
    MEDIA_ARIA2_TASK_STATUS.DOWNLOADING
];

/**
 * 接收并处理 Aria2 任务状态变更通知（下载中/完成/失败状态流转）
 * @param {string} gid - 任务 GID
 * @param {number|string} status - 目标状态
 * @returns {Promise<{ file: string, link: string, id: number }|undefined>} 完成时返回切片上传参数
 */
export async function updateTaskStatus(gid, status) {
    const taskStatus = parseInt(String(status));
    // validate aria2 status
    CAN_UPDATE_ARIA2_TASK_STATUS.includes(taskStatus) || __throwMessage('Invalid aria2 task status.');

    // validate aria2 task exists
    const taskInfo = await aria2Service.getTaskInfo(gid);
    taskInfo || __throwMessage('Aria2 task not found.');

    // validate aria2 task info exists
    const taskData = await aria2TaskRep.selectByGid(gid);
    taskData || __throwMessage('Invalid aria2 task.');

    // update aria2 task status
    const { id, minioId } = taskData;
    await aria2TaskRep.updateStatusById(taskStatus, id);

    // get video minio info
    const minioInfo = await videoMinioRep.selectOneById(minioId);
    minioInfo || notifyUpdateTaskStatusFailed('Get task\'s minio info failed.', gid);

    if (MEDIA_ARIA2_TASK_STATUS.FAILED === taskStatus) {
        __log.info(`[${gid}] Aria2 task download failed, setup minio status failed.`);
        await transitionMinioStatus(minioId, MEDIA_MINIO_STATUS.FAILED, { source: MINIO_STATUS_SOURCE.ARIA2 });
        return;
    }

    // handle aria2 task complete
    // validate task files
    const { files } = taskInfo;
    __isEmptyArray(files) && notifyUpdateTaskStatusFailed('Invalid aria2 task files.', gid);

    // generate minio link
    const { path: filePath } = files[0];

    if (MEDIA_ARIA2_TASK_STATUS.DOWNLOADING === taskStatus) {
        // save video minio file path
        __log.info(`[${gid}] Aria2 task started, setup minio file path.`);
        await aria2TaskRep.updateFilePathById(filePath, id);
        return;
    }

    // save video minio uploading
    __log.info(`[${gid}] Aria2 task download complete, setup minio status uploading.`);
    await transitionMinioStatus(minioId, MEDIA_MINIO_STATUS.UPLOADING, { source: MINIO_STATUS_SOURCE.ARIA2 });

    return {
        file: filePath,
        link: minioInfo.link,
        id: minioId
    };
}

function notifyUpdateTaskStatusFailed(message, gid) {
    pushNotification(`Update aria2 task[${gid}] status failed: ${message}`);
    __throwMessage(message);
}