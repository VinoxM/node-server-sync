import aria2Service from "#modules/download/aria2Service.js";
import { MEDIA_ARIA2_TASK_STATUS, MEDIA_TYPE_DESCRIPTION } from "#modules/media/constants/mediaConst.js";
import aria2TaskRep from "#modules/media/repository/aria2TaskRep.js";
import videoMinioRep from "#modules/media/repository/videoMinioRep.js";
import { removeRemoteFiles } from "#modules/ssh/sshExecutorService.js";

/**
 * 媒体 Aria2 下载任务原子操作服务（最底层）
 *
 * 仅依赖 Aria2 RPC 客户端与数据仓库，不感知 MinIO 状态机与失败重试调度，
 * 供入库服务 / 重试服务 / 上层任务服务复用。
 */

const MEDIA_ARIA2_SAVE_DIR = "./media";

/**
 * aria2 原生下载重试参数（透传至 aria2.addUri）
 * 使用 kebab-case 且值为字符串，符合 aria2 JSON-RPC 选项规范；用于消化瞬时网络错误，减少落到应用层重试的概率。
 * @see https://aria2.github.io/manual/en/html/aria2c.html#rpc-interface
 */
const MEDIA_ARIA2_OPTION = {
    /** 同一 uri 的最大尝试次数 (--max-tries) */
    'max-tries': '3',
    /** 每次重试间隔秒数 (--retry-wait) */
    'retry-wait': '10',
    /** 断点续传 (--continue) */
    'continue': 'true',
    /** 连接超时秒数 (--connect-timeout) */
    'connect-timeout': '30',
    /** 单次读超时秒数 (--timeout) */
    'timeout': '60'
};

/** 判定 aria2 是否因「不认识传入选项」而拒绝请求 */
const ARIA2_UNKNOWN_OPTION_PATTERN = /unknown option|unrecognized|invalid option|not recognized/i;

/**
 * 添加一条媒体离线下载 Aria2 任务并持久化记录
 * @param {string} uri - 下载链接
 * @param {number} minioId - 关联的 video_minio 主键 ID
 * @param {number} type - 资源类型 (MEDIA_VIDEO_MINIO_TYPE)
 * @returns {Promise<void>}
 */
export async function addTask(uri, minioId, type) {
    const taskInfo = await addMediaAria2Task(uri);
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

/**
 * 提交 aria2 下载任务：优先携带原生重试参数；若 aria2 版本不识别这些选项，则退化为默认参数重试一次。
 * 仅在明确判定为「未知选项」时才降级，避免其它错误被掩盖或造成重复建单。
 * @param {string} uri - 下载链接
 * @returns {Promise<import('#types/downloadTypes.d.ts').Aria2TaskStatus|undefined>} 任务初始状态详情
 */
async function addMediaAria2Task(uri) {
    const baseOptions = { dir: MEDIA_ARIA2_SAVE_DIR };
    try {
        return await aria2Service.addTask(uri, { ...baseOptions, ...MEDIA_ARIA2_OPTION });
    } catch (err) {
        const message = String(err?.message ?? err);
        if (!ARIA2_UNKNOWN_OPTION_PATTERN.test(message)) throw err;
        __log.warn(`[Aria2] Aria2 rejected retry options, fallback to plain addUri. Cause: ${message}`);
        return await aria2Service.addTask(uri, baseOptions);
    }
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
 * 低层不做重试联动：置为 FAILED 后是否取消自动重试由上层决定。
 * @param {number} taskId - aria2_task 主键 ID
 * @returns {Promise<number|null>} 被移除任务关联的 video_minio 主键 ID，任务不存在时返回 null
 */
export async function removeTask(taskId) {
    const task = await aria2TaskRep.selectById(taskId);
    if (!task) return null;
    const { minioId, gid, filePath } = task;
    await aria2TaskRep.deleteById(taskId);
    await aria2Service.removeTask(gid);
    __isNotBlank(filePath) && await removeRemoteFiles([filePath, filePath + '.aria2']);
    const { exists } = await aria2TaskRep.selectExistsByMinioId(minioId) ?? { exists: 0 };
    exists || await videoMinioRep.setupFailedByIdWhenNotComplete(minioId);
    return minioId;
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

/**
 * 批量查询 GID 在 aria2 中的真实状态（供启动恢复对账使用）
 * @param {string[]} gids - 任务 GID 列表
 * @returns {Promise<Map<string, string|null>|null>} gid -> aria2 状态（null 表示该 GID 已不存在）；
 *          返回 null 表示 aria2 不可达 / 结果不可信，调用方必须放弃对账而不是当作失败
 */
export async function getGidStatusMap(gids) {
    if (__isEmptyArray(gids)) return new Map();
    const res = await aria2Service.getTaskMultiStatus(gids);
    // 长度不一致或非数组（封装内部已吞掉异常并返回 undefined）→ 视为不可达，禁止据此判定任务死亡
    if (!Array.isArray(res) || res.length !== gids.length) return null;
    const map = new Map();
    gids.forEach((gid, index) => {
        const item = res[index];
        // system.multicall 中，不存在的 GID 会返回 fault 对象而非 [result]，据此判定为已失效
        const status = Array.isArray(item) ? item[0]?.status : null;
        map.set(gid, status ?? null);
    });
    return map;
}
