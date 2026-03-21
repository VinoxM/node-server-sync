import { getAria2Socket } from "../../instance/aria2Socket.js";
import { MEDIA_ARIA2_TASK_STATUS, MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION } from "../../constraints/mediaConst.js";
import aria2TaskRep from "../../repository/media/aria2TaskRep.js";
import { pushNotification } from "../../sockets/notification.js";
import videoMinioRep from "../../repository/media/videoMinioRep.js";
import { getExecutor } from "../sshHandler.js";
import { SSH_CMD_BATCH_DELETE_SIMPLE } from "../../constraints/sshScriptsConst.js";

const MEDIA_ARIA2_SAVE_DIR = "./media";
const CAN_UPDATE_ARIA2_TASK_STATUS = [MEDIA_ARIA2_TASK_STATUS.COMPLETE, MEDIA_ARIA2_TASK_STATUS.FAILED, MEDIA_ARIA2_TASK_STATUS.DOWNLOADING]

async function addTask(url, options) {
    const gid = await getAria2Socket().addUri(url, options)
    return getAria2Socket().getInfo(gid);
}

export async function getTaskInfo(gid) {
    return getAria2Socket().getInfo(gid);
}

async function removeTask(gid) {
    await getAria2Socket().remove(gid).catch(ex => __log.error(`Remove aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

async function getTaskMultiStatus(gidArr) {
    return getAria2Socket().getMultiStatus(gidArr).catch(ex => __log.error(`Get aria2 task multi status failed.`, ex?.message, ex?.response?.data || ''));
}

export async function pauseTask(gid) {
    await getAria2Socket().pause(gid).catch(ex => __log.error(`Pause aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

export async function resumeTask(gid) {
    await getAria2Socket().resume(gid).catch(ex => __log.error(`Resume aria2 task failed.`, ex?.message, ex?.response?.data || ''));
}

/**
 * Add video step1 from status: ANALYZING.
 * Aria2 task status:
 * DOWNLOADING
 */
export async function addAria2Task(uri, minioId, type) {
    const taskInfo = await addTask(uri, { dir: MEDIA_ARIA2_SAVE_DIR })
    taskInfo?.gid || throwMessage(`Add media ${MEDIA_TYPE_DESCRIPTION[type] || ''} aria2 task failed.`)
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
export async function pauseOrResumeAria2Task(gid, operator) {
    SUPPORTED_ARIA2_OPERATOR.includes(operator) || throwMessage('Invalid operator')
    if (ARIA2_OPERATOR.PAUSE === operator) {
        await pauseTask(gid)
    } else if (ARIA2_OPERATOR.RESUME === operator) {
        await resumeTask(gid)
    }
}

export async function removeAria2Task(taskId) {
    const task = await aria2TaskRep.selectById(taskId);
    if (!task) return
    const { minioId, gid, filePath } = task
    await aria2TaskRep.deleteById(taskId)
    await removeTask(gid)
    await deleteRemoteFiles([filePath])
    const { exists } = await aria2TaskRep.selectExistsByMinioId(minioId)
    exists || await videoMinioRep.setupFailedByIdWhenNotComplete(minioId)
}

export async function getAria2InfoAndTaskStatus(ids) {
    const result = {}
    const { rows, data } = await aria2TaskRep.selectByIds(ids)
    if (rows === 0) return result
    const gidArr = data.map(o => (result[o.gid] = { status: o.status }, o.gid))
    const res = await getTaskMultiStatus(gidArr)
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

async function deleteRemoteFiles(files) {
    __log.info(`Ready to delete files: `, files)
    const executor = getExecutor('fedora')
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    try {
        const { code } = await executor.exec(SSH_CMD_BATCH_DELETE_SIMPLE, files);
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ssh script failed.', e)
        return -3
    }
}

/**
 * Add video step2 from status: UPLOADING
 * Aria2 status:
 * DOWNLOADING -> COMPLETE/FAILED
 * Minio status:
 * PREPARED/UPLOADING -> UPLOADING/FAILED
 */
export async function updateAria2TaskStatus(gid, status) {
    const taskStatus = parseInt(status)
    // validate aria2 status
    CAN_UPDATE_ARIA2_TASK_STATUS.includes(taskStatus) || throwMessage('Invalid aria2 task status.')

    // validate aria2 task exists
    const taskInfo = await getTaskInfo(gid)
    taskInfo || throwMessage('Aria2 task not found.')

    // validate aria2 task info exists
    const taskData = await aria2TaskRep.selectByGid(gid)
    taskData || throwMessage('Invalid aria2 task.')

    // update aria2 task status
    const { id, minioId } = taskData
    await aria2TaskRep.updateStatusById(taskStatus, id)

    // get video minio info
    const minioInfo = await videoMinioRep.selectOneById(minioId)
    minioInfo || notifyUpdateAria2TaskStatusFailed('Get task\'s minio info failed.')

    if (MEDIA_ARIA2_TASK_STATUS.FAILED === taskStatus) {
        __log.info(`[${gid}] Aria2 task download failed, setup minio status failed.`)
        await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.FAILED)
        return
    }

    // handle aria2 task complete
    // validate task files
    const { files } = taskInfo
    isEmptyArray(files) && notifyUpdateAria2TaskStatusFailed('Invalid aria2 task files.')

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

function notifyUpdateAria2TaskStatusFailed(message, gid) {
    pushNotification(`Update aria2 task[${gid}] status failed: ${message}`)
    throwMessage(message)
}