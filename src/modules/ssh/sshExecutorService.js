import { getSSHExecutor } from "#core/instance/sshExecutor.js";
import sshExecutorConst from "./constants/sshExecutorConst.js";

/**
 * @typedef {import('@types/sshTypes.d.ts').ISSHExecutor} ISSHExecutor
 * @typedef {import('@types/sshTypes.d.ts').SshExecutorOptions} SshExecutorOptions
 * @typedef {import('@types/sshTypes.d.ts').ExtractSubtitleItem} ExtractSubtitleItem
 * @typedef {import('@types/sshTypes.d.ts').ExtractFontItem} ExtractFontItem
 * @typedef {import('@types/sshTypes.d.ts').SshExtractResult<ExtractSubtitleItem>} SshSubtitleExtractResult
 * @typedef {import('@types/sshTypes.d.ts').SshExtractResult<ExtractFontItem>} SshFontExtractResult
 * @typedef {import('@types/sshTypes.d.ts').SshScriptDefinition} SshScriptDefinition
 */

const DEFAULT_SSH_EXECUTOR_LABEL = 'storage';

/**
 * 根据选项获取适用的 SSH 执行器实例
 * @param {SshExecutorOptions} [opts] - 配置选项
 * @returns {ISSHExecutor|null}
 */
function getSuitableSshExecutor(opts) {
    const label = opts?.label ?? DEFAULT_SSH_EXECUTOR_LABEL;
    return getSSHExecutor(label);
}

/**
 * 执行底层 SSH 脚本命令
 * @param {SshScriptDefinition} executionOpt - 脚本元数据配置
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @param {...any} sshArgs - 透传给脚本的参数列表
 * @returns {Promise<number>} 执行退出码 (0 表示成功，1 为异常，-2 为执行器未就绪)
 */
async function executeSshScript(executionOpt, opts = {}, ...sshArgs) {
    const executor = getSuitableSshExecutor(opts);
    if (!executor) {
        __log.warn(`SSH executor not ready.`);
        return -2;
    }
    const { script, descGenerator, title } = executionOpt;
    const desc = descGenerator(...sshArgs);
    try {
        const { code } = await executor.exec(script?.value ?? script, [...sshArgs], { desc, title, onData: opts.onData });
        return parseInt(code);
    } catch (e) {
        __log.error(`Execute ssh script [${title}] failed.`, e.message ?? e);
        return 1;
    }
}

/**
 * 将远程服务器文件移动并上传至 MinIO 对象存储 (剪切操作)
 * @param {string} sourceFile - 远程源文件绝对路径
 * @param {string} minioLink - 目标 MinIO 路径 (bucket/object)
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<number>} 退出码
 */
export async function moveRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.MINIO_MOVE_SCRIPT, opts, sourceFile, minioLink);
}

/**
 * 将远程服务器文件复制并上传至 MinIO 对象存储 (保留原文件)
 * @param {string} sourceFile - 远程源文件绝对路径
 * @param {string} minioLink - 目标 MinIO 路径 (bucket/object)
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<number>} 退出码
 */
export async function copyRemoteFileToMinio(sourceFile, minioLink, opts = {}) {
    return executeSshScript(sshExecutorConst.MINIO_COPY_SCRIPT, opts, sourceFile, minioLink);
}

/**
 * 从远程 URL 下载文件并直接流式转存至 MinIO 对象存储
 * @param {string} sourceUrl - 待下载的远程 HTTP/HTTPS URL
 * @param {string} minioLink - 目标 MinIO 存储路径
 * @param {SshExecutorOptions & { useProxy?: boolean }} [opts={}] - 可选包含代理的配置选项
 * @returns {Promise<number>} 退出码
 */
export async function downloadFileToMinio(sourceUrl, minioLink, opts = {}) {
    const { useProxy, ...otherOpts } = opts;
    const script = useProxy ? sshExecutorConst.MINIO_DOWNLOAD_SCRIPT_WITH_PROXY : sshExecutorConst.MINIO_DOWNLOAD_SCRIPT;
    return executeSshScript(script, otherOpts, sourceUrl, minioLink);
}

/**
 * 批量删除远程服务器文件
 * @param {string[]} files - 待删除的文件路径数组
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<number>} 退出码
 */
export async function removeRemoteFiles(files, opts = {}) {
    __log.info(`Ready to delete files: `, files);
    return executeSshScript(sshExecutorConst.BATCH_DELETE_FILE, opts, ...files);
}

/**
 * 批量删除远程服务器空文件夹
 * @param {string[]} folders - 待删除的文件夹路径数组
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<number>} 退出码
 */
export async function removeRemoteEmptyFolders(folders, opts = {}) {
    __log.info(`Ready to delete empty folders: `, folders);
    return executeSshScript(sshExecutorConst.BATCH_DELETE_FOLDER, opts, ...folders);
}

/**
 * 将远程 MKV 视频文件转码为 MP4 格式 (利用 ffmpeg)
 * @param {string} mkvFilePath - 远程源 MKV 文件路径
 * @param {string} mp4FilePath - 目标输出 MP4 文件路径
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<number>} 退出码
 */
export async function convertMkvToMp4(mkvFilePath, mp4FilePath, opts = {}) {
    return executeSshScript(sshExecutorConst.FFMPEG_CONVERT_MKV_TO_MP4, opts, mkvFilePath, mp4FilePath);
}

/**
 * 将远程 FLV 视频文件转封装/转码为 MP4 格式
 * @param {string} flvFilePath - 远程源 FLV 文件路径
 * @param {string} mp4FilePath - 目标输出 MP4 文件路径
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<number>} 退出码
 */
export async function convertFlvToMp4(flvFilePath, mp4FilePath, opts = {}) {
    return executeSshScript(sshExecutorConst.FFMPEG_CONVERT_FLV_TO_MP4, opts, flvFilePath, mp4FilePath);
}

/**
 * 从远程 MKV 视频文件中提取全部内嵌字幕流，输出为独立字幕文件并返回解析元数据列表
 * @param {string} mkvFilePath - 远程 MKV 文件路径
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<SshSubtitleExtractResult>} 字幕提取结果与状态码
 */
export async function extractMkvSubtitles(mkvFilePath, opts = {}) {
    let result = null;
    const onData = data => {
        __log.print(data);
        try {
            if (result === null && String(data).startsWith('return ')) {
                result = JSON.parse(String(data).trim().substring('return '.length));
            }
        } catch {
        }
    };
    const code = await executeSshScript(sshExecutorConst.FFMPEG_EXTRACT_MKV_SUBTITLES, { ...opts, onData }, mkvFilePath);
    return { result: result ?? [], code };
}

/**
 * 从远程 MKV 视频文件中提取全部内嵌字体附件文件，并通过 `fc-scan` 解析字体属性返回元数据列表
 * @param {string} mkvFilePath - 远程 MKV 文件路径
 * @param {SshExecutorOptions} [opts={}] - 执行选项
 * @returns {Promise<SshFontExtractResult>} 字体提取结果与状态码
 */
export async function extractMkvFonts(mkvFilePath, opts = {}) {
    let result = null;
    const onData = data => {
        __log.print(data);
        try {
            if (result === null && String(data).startsWith('return ')) {
                result = JSON.parse(String(data).trim().substring('return '.length));
            }
        } catch {
        }
    };
    const code = await executeSshScript(sshExecutorConst.FFMPEG_EXTRACT_MKV_FONTS, { ...opts, onData }, mkvFilePath);
    return { result: result ?? [], code };
}