import aria2Service from "../../download/aria2Service.js";
import { MEDIA_ARIA2_TASK_STATUS, MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION } from "../constants/mediaConst.js";
import aria2TaskRep from "../repository/aria2TaskRep.js";
import videoMinioRep from "../repository/videoMinioRep.js";
import { pushNotification } from "#api/sockets/notification.js";
import { removeRemoteFiles } from "../../ssh/sshExecutorService.js";

const MEDIA_ARIA2_SAVE_DIR = "./media";

/**
 * 添加一条媒体离线下载 Aria2 任务并持久化记录
 * @param {string} uri - 下载链接
 * @param {number} minioId - 关联的 video_minio 主键 ID
 * @param {number} type - 资源类型 (MEDIA_VIDEO_MINIO_TYPE)
 * @returns {Promise<void>}
 */
export async function addTask(uri, minioId, type) {
    const taskInfo = await aria2Service.addTask(uri, { dir: MEDIA_ARIA2_SAVE_DIR });
    taskInfo?.gid || __throwMessage(`Add media ${MEDIA_TYPE_DESCRIPTION[type] || ''} aria2 task failed.`);
    const aria2Task = {
        minioId,
        gid: taskInfo.gid,
        status: MEDIA_ARIA2_TASK_STATUS.PREPARED,
        filePath: taskInfo.files?.[0]?.path,
        fileNum: taskInfo.files?.length || 0
    };
    await aria2TaskRep.insertOne(aria2Task);
}

const ARIA2_OPERATOR = { PAUSE: 'pause', RESUME: 'resume' };
const SUPPORTED_ARIA2_OPERATOR = [ARIA2_OPERATOR.PAUSE, ARIA2_OPERATOR.RESUME];

/**
 * 暂停或恢复指定的 Aria2 任务
 * @param {string} gid - 任务 GID
 * @param {string} operator - 操作指令 ('pause' 或 'resume')
 * @returns {Promise<void>}
 */
export async function pauseOrResumeTask(gid, operator) {
    SUPPORTED_ARIA2_OPERATOR.includes(operator) || __throwMessage('Invalid operator');
    if (ARIA2_OPERATOR.PAUSE === operator) {
        await aria2Service.pauseTask(gid);
    } else if (ARIA2_OPERATOR.RESUME === operator) {
        await aria2Service.resumeTask(gid);
    }
}

/**
 * 移除指定的 Aria2 任务并清理本地临时文件
 * @param {number} taskId - aria2_task 主键 ID
 * @returns {Promise<void>}
 */
export async function removeTask(taskId) {
    const task = await aria2TaskRep.selectById(taskId);
    if (!task) return;
    const { minioId, gid, filePath } = task;
    await aria2TaskRep.deleteById(taskId);
    await aria2Service.removeTask(gid);
    __isNotBlank(filePath) && await removeRemoteFiles([filePath, filePath + '.aria2']);
    const { exists } = await aria2TaskRep.selectExistsByMinioId(minioId) ?? { exists: 0 };
    exists || await videoMinioRep.setupFailedByIdWhenNotComplete(minioId);
}

/**
 * 批量查询 Aria2 任务的实时下载速率与完成进度百分比
 * @param {number[]} ids - aria2_task 主键 ID 列表
 * @returns {Promise<Record<string, { status: number, taskStatus?: string, speed?: string, percent?: number }>>}
 */
export async function getTaskInfoAndDownloadStatus(ids) {
    const result = {};
    const { rows, data } = await aria2TaskRep.selectByIds(ids);
    if (rows === 0) return result;
    const gidArr = data.map(o => (result[o.gid] = { status: o.status }, o.gid));
    const res = await aria2Service.getTaskMultiStatus(gidArr);
    if (Array.isArray(res) && res.length > 0) {
        res.forEach(t => {
            const r = t[0];
            if (r?.gid) {
                const { gid, status, downloadSpeed, completedLength, totalLength } = r;
                const completed = BigInt(completedLength);
                const total = BigInt(totalLength);
                result[gid].taskStatus = status;
                result[gid].speed = downloadSpeed;
                result[gid].percent = total > 0n ? Number(completed * 10000n / total) / 100 : 0;
            }
        });
    }
    return result;
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
        await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.FAILED);
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
    await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.UPLOADING);

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