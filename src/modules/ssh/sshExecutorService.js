import { getSSHExecutor } from "../../core/instance/sshExecutor.js"
import {
    SSH_CMD_BATCH_DELETE_SIMPLE,
    SSH_CMD_FFMPEG_CONVERT_MKV_TO_MP4,
    SSH_CMD_MINIO_COPY_SCRIPT,
    SSH_CMD_MINIO_DOWNLOAD_SCRIPT,
    SSH_CMD_MINIO_MOVE_SCRIPT
} from "./constants/sshScriptsConst.js"

const DEFAULT_SSH_EXECUTOR_LABEL = 'storage'

function getSuitableSshExecutor(opts) {
    const label = opts?.label ?? DEFAULT_SSH_EXECUTOR_LABEL
    return getSSHExecutor(label)
}

export async function moveRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    const executor = getSuitableSshExecutor(opts)
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    try {
        const desc = `Move file to minio: ${sourceFile} -> ${minioLink}`;
        const { code } = await executor.exec(SSH_CMD_MINIO_MOVE_SCRIPT, [sourceFile, minioLink], { desc });
        return parseInt(code)
    } catch (e) {
        __log.error('Execute move file to minio ssh script failed.', e.message ?? e)
        return 1
    }
}

export async function copyRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    const executor = getSuitableSshExecutor(opts)
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    try {
        const desc = `Copy file to minio: ${sourceFile} -> ${minioLink}`;
        const { code } = await executor.exec(SSH_CMD_MINIO_COPY_SCRIPT, [sourceFile, minioLink], { desc });
        return parseInt(code)
    } catch (e) {
        __log.error('Execute copy file to minio ssh script failed.', e.message ?? e)
        return 1
    }
}

export async function downloadFileToMinio(sourceUrl, minioLink, opts = {}) {
    const executor = getSuitableSshExecutor(opts)
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    try {
        const desc = `Download file to minio: ${sourceUrl} -> ${minioLink}`;
        const { code } = await executor.exec(SSH_CMD_MINIO_DOWNLOAD_SCRIPT, [sourceUrl, minioLink], { desc });
        return parseInt(code)
    } catch (e) {
        __log.error('Execute download file to minio ssh script failed.', e.message ?? e)
        return 1
    }
}

export async function removeRemoteFiles(files, opts = {}) {
    __log.info(`Ready to delete files: `, files)
    const executor = getSuitableSshExecutor(opts)
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    try {
        const desc = `Remove remote files: ${files.join(', ')}`;
        const { code } = await executor.exec(SSH_CMD_BATCH_DELETE_SIMPLE, files, { desc });
        return parseInt(code)
    } catch (e) {
        __log.error('Execute remove remote files ssh script failed.', e.message ?? e)
        return 1
    }
}

export async function convertMkvToMp4(mkvFilePath, mp4FilePath, opts = {}) {
    const executor = getSuitableSshExecutor(opts)
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    try {
        const desc = `Convert file mkv to mp4: ${mkvFilePath} -> ${mp4FilePath}`;
        const { code } = await executor.exec(SSH_CMD_FFMPEG_CONVERT_MKV_TO_MP4, [mkvFilePath, mp4FilePath], { desc });
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ffmpeg convert ssh script failed.', e.message ?? e)
        return 1
    }
}