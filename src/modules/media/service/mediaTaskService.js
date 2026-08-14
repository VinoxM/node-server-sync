import aria2Service from "../../download/aria2Service.js";
import { MEDIA_ARIA2_TASK_STATUS, MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION } from "../constants/mediaConst.js";
import aria2TaskRep from "../repository/aria2TaskRep.js";
import videoMinioRep from "../repository/videoMinioRep.js";
import { pushNotification } from "../../../api/sockets/notification.js";
import { removeRemoteFiles } from "../../ssh/sshExecutorService.js";

const MEDIA_ARIA2_SAVE_DIR = "./media";

/**
 * Add video step1 from status: ANALYZING.
 * Aria2 task status:
 * DOWNLOADING
 */
export async function addTask(uri, minioId, type) {
    const taskInfo = await aria2Service.addTask(uri, { dir: MEDIA_ARIA2_SAVE_DIR })
    taskInfo?.gid || __throwMessage(`Add media ${MEDIA_TYPE_DESCRIPTION[type] || ''} aria2 task failed.`)
    const aria2Task = {
        minioId,
        gid: taskInfo.gid,
        status: MEDIA_ARIA2_TASK_STATUS.PREPARED,
        filePath: taskInfo.files?.[0]?.path,
        fileNum: taskInfo.files?.length || 0
    }
    await aria2TaskRep.insertOne(aria2Task)
}

const ARIA2_OPERATOR = { PAUSE: 'pause', RESUME: 'resume' }
const SUPPORTED_ARIA2_OPERATOR = [ARIA2_OPERATOR.PAUSE, ARIA2_OPERATOR.RESUME]
export async function pauseOrResumeTask(gid, operator) {
    SUPPORTED_ARIA2_OPERATOR.includes(operator) || __throwMessage('Invalid operator')
    if (ARIA2_OPERATOR.PAUSE === operator) {
        await aria2Service.pauseTask(gid)
    } else if (ARIA2_OPERATOR.RESUME === operator) {
        await aria2Service.resumeTask(gid)
    }
}

export async function removeTask(taskId) {
    const task = await aria2TaskRep.selectById(taskId);
    if (!task) return
    const { minioId, gid, filePath } = task
    await aria2TaskRep.deleteById(taskId)
    await aria2Service.removeTask(gid)
    __isNotBlank(filePath) && await removeRemoteFiles([filePath, filePath + '.aria2'])
    const { exists } = await aria2TaskRep.selectExistsByMinioId(minioId)
    exists || await videoMinioRep.setupFailedByIdWhenNotComplete(minioId)
}

export async function getTaskInfoAndDownloadStatus(ids) {
    const result = {}
    const { rows, data } = await aria2TaskRep.selectByIds(ids)
    if (rows === 0) return result
    const gidArr = data.map(o => (result[o.gid] = { status: o.status }, o.gid))
    const res = await aria2Service.getTaskMultiStatus(gidArr)
    if (Array.isArray(res) && res.length > 0) {
        res.forEach(t => {
            const r = t[0]
            if (r?.gid) {
                const { gid, status, downloadSpeed, completedLength, totalLength } = r
                const completed = BigInt(completedLength);
                const total = BigInt(totalLength);
                result[gid].taskStatus = status;
                result[gid].speed = downloadSpeed;
                result[gid].percent = total > 0n ? Number(completed * 10000n / total) / 100 : 0;
            }
        })
    }
    return result
}

/**
 * Add video step2 from status: UPLOADING
 * Aria2 status:
 * DOWNLOADING -> COMPLETE/FAILED
 * Minio status:
 * PREPARED/UPLOADING -> UPLOADING/FAILED
 */
const CAN_UPDATE_ARIA2_TASK_STATUS = [
    MEDIA_ARIA2_TASK_STATUS.COMPLETE,
    MEDIA_ARIA2_TASK_STATUS.FAILED,
    MEDIA_ARIA2_TASK_STATUS.DOWNLOADING
]
export async function updateTaskStatus(gid, status) {
    const taskStatus = parseInt(status)
    // validate aria2 status
    CAN_UPDATE_ARIA2_TASK_STATUS.includes(taskStatus) || __throwMessage('Invalid aria2 task status.')

    // validate aria2 task exists
    const taskInfo = await aria2Service.getTaskInfo(gid)
    taskInfo || __throwMessage('Aria2 task not found.')

    // validate aria2 task info exists
    const taskData = await aria2TaskRep.selectByGid(gid)
    taskData || __throwMessage('Invalid aria2 task.')

    // update aria2 task status
    const { id, minioId } = taskData
    await aria2TaskRep.updateStatusById(taskStatus, id)

    // get video minio info
    const minioInfo = await videoMinioRep.selectOneById(minioId)
    minioInfo || notifyUpdateTaskStatusFailed('Get task\'s minio info failed.')

    if (MEDIA_ARIA2_TASK_STATUS.FAILED === taskStatus) {
        __log.info(`[${gid}] Aria2 task download failed, setup minio status failed.`)
        await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.FAILED)
        return
    }

    // handle aria2 task complete
    // validate task files
    const { files } = taskInfo
    __isEmptyArray(files) && notifyUpdateTaskStatusFailed('Invalid aria2 task files.')

    // generate minio link
    const { path: filePath } = files[0]

    if (MEDIA_ARIA2_TASK_STATUS.DOWNLOADING === taskStatus) {
        // save video minio file path
        __log.info(`[${gid}] Aria2 task started, setup minio file path.`)
        await aria2TaskRep.updateFilePathById(filePath, id)
        return
    }

    // save video minio uploading
    __log.info(`[${gid}] Aria2 task download complete, setup minio status uploading.`)
    await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.UPLOADING)

    return {
        file: filePath,
        link: minioInfo.link,
        id: minioId
    }
}

function notifyUpdateTaskStatusFailed(message, gid) {
    pushNotification(`Update aria2 task[${gid}] status failed: ${message}`)
    __throwMessage(message)
}