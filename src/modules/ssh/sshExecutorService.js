import { getSSHExecutor } from "../../core/instance/sshExecutor.js"
import sshExecutorConst from "./constants/sshExecutorConst.js"

const DEFAULT_SSH_EXECUTOR_LABEL = 'storage'

function getSuitableSshExecutor(opts) {
    const label = opts?.label ?? DEFAULT_SSH_EXECUTOR_LABEL
    return getSSHExecutor(label)
}

async function executeSshScript(executionOpt, opts = {}, ...sshArgs) {
    const executor = getSuitableSshExecutor(opts)
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    const { script, descGenerator, title } = executionOpt
    const desc = descGenerator(...sshArgs);
    try {
        const { code } = await executor.exec(script, [...sshArgs], { desc, title });
        return parseInt(code)
    } catch (e) {
        __log.error(`Execute ssh script [${title}] failed.`, e.message ?? e)
        return 1
    }
}

export async function moveRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.MOVE_FILE_TO_MINIO, opts, sourceFile, minioLink)
}

export async function copyRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.COPY_FILE_TO_MINIO, opts, sourceFile, minioLink)
}

export async function downloadFileToMinio(sourceUrl, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.DOWNLOAD_FILE_TO_MINIO, opts, sourceUrl, minioLink)
}

export async function removeRemoteFiles(files, opts = {}) {
    __log.info(`Ready to delete files: `, files)
    return executeSshScript(sshExecutorConst.REMOVE_REMOTE_FILE, opts, ...files)
}

export async function convertMkvToMp4(mkvFilePath, mp4FilePath, opts = {}) {
    return executeSshScript(sshExecutorConst.CONVERT_MKV_TO_MP4, opts, mkvFilePath, mp4FilePath)
}

export async function convertFlvToMp4(flvFilePath, mp4FilePath, opts = {}) {
    return executeSshScript(sshExecutorConst.CONVERT_FLV_TO_MP4, opts, flvFilePath, mp4FilePath)
}