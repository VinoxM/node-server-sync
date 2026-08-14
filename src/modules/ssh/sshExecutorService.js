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
        const { code } = await executor.exec(script?.value ?? script, [...sshArgs], { desc, title, onData: opts.onData });
        return parseInt(code)
    } catch (e) {
        __log.error(`Execute ssh script [${title}] failed.`, e.message ?? e)
        return 1
    }
}

export async function moveRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.MINIO_MOVE_SCRIPT, opts, sourceFile, minioLink)
}

export async function copyRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.MINIO_COPY_SCRIPT, opts, sourceFile, minioLink)
}

export async function downloadFileToMinio(sourceUrl, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.MINIO_DOWNLOAD_SCRIPT, opts, sourceUrl, minioLink)
}

export async function removeRemoteFiles(files, opts = {}) {
    __log.info(`Ready to delete files: `, files)
    return executeSshScript(sshExecutorConst.BATCH_DELETE_FILE, opts, ...files)
}

export async function removeRemoteEmptyFolders(folders, opts = {}) {
    __log.info(`Ready to delete empty folders: `, folders)
    return executeSshScript(sshExecutorConst.BATCH_DELETE_FOLDER, opts, ...folders)
}

export async function convertMkvToMp4(mkvFilePath, mp4FilePath, opts = {}) {
    return executeSshScript(sshExecutorConst.FFMPEG_CONVERT_MKV_TO_MP4, opts, mkvFilePath, mp4FilePath)
}

export async function convertFlvToMp4(flvFilePath, mp4FilePath, opts = {}) {
    return executeSshScript(sshExecutorConst.FFMPEG_CONVERT_FLV_TO_MP4, opts, flvFilePath, mp4FilePath)
}

export async function extractMkvSubtitles(mkvFilePath, opts = {}) {
    let result = null
    const onData = data => {
        __log.print(data)
        try {
            if (result === null && String(data).startsWith('return ')) {
                result = JSON.parse(String(data).trim().substring('return '.length))
            }
        } catch {
        }
    }
    const code = await executeSshScript(sshExecutorConst.FFMPEG_EXTRACT_MKV_SUBTITLES, { ...opts, onData }, mkvFilePath)
    return { result: result ?? [], code }
}

export async function extractMkvFonts(mkvFilePath, opts = {}) {
    let result = null
    const onData = data => {
        __log.print(data)
        try {
            if (result === null && String(data).startsWith('return ')) {
                result = JSON.parse(String(data).trim().substring('return '.length))
            }
        } catch {
        }
    }
    const code = await executeSshScript(sshExecutorConst.FFMPEG_EXTRACT_MKV_FONTS, { ...opts, onData }, mkvFilePath)
    return { result: result ?? [], code }
}