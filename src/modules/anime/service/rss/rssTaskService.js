import path, { join } from 'path';
import {
    addTorrent, getUUIDByTorrentInfo, torrentFiles,
    torrentInfo, deleteTorrent, deleteTag, torrentsInfo,
    generateTorrentState, stopTorrent, startTorrent
} from "#modules/download/qbitorrentService.js";
import { TASK_STATUS, EPISODE_STATUS, EPISODE_FAILED_REASON } from "#modules/anime/constants/rssTaskStatusConst.js";
import rssEpisodeRep from "#modules/anime/repository/rss/rssEpisodeRep.js";
import rssResultRep from "#modules/anime/repository/rss/rssResultRep.js";
import rssTaskRep from "#modules/anime/repository/rss/rssTaskRep.js";
import { generateMinioLink, getAnimeEpisode, isFileExtAnime } from "#modules/anime/service/rss/rssEpisodeService.js";
import { filterUserRssFavorites } from "#modules/account/service/rssFavoritesService.js";
import { pushNotification } from '#api/sockets/notification.js';
import { backfillSubtitleFonts, resolveEpisodeSubtitle } from '#modules/anime/service/rss/rssSubtitleService.js';
import {
    convertMkvToMp4, extractMkvFonts, extractMkvSubtitles,
    removeRemoteEmptyFolders, removeRemoteFiles
} from '#modules/ssh/sshExecutorService.js';
import { insertFont, matchSubtitleFont } from '#modules/anime/service/rss/rssFontsService.js';
import { Tracer } from '#core/infra/tracer.js';
import rssSubscribeRep from '#modules/anime/repository/rss/rssSubscribeRep.js';
import { concatTracker } from '#modules/anime/service/rss/rssTrackerService.js';

const TORRENT_STOPPED_STATE = ['stoppedDL', 'stoppedUP', 'stalledUP'];
const canUpdateStatus = [TASK_STATUS.RESOLVING, TASK_STATUS.COMPLETE, TASK_STATUS.PARTIALLY_COMPLETE];
const canDeleteStatus = [TASK_STATUS.FAILED, TASK_STATUS.DOWNLOADING, TASK_STATUS.RESOLVE_FAILED, TASK_STATUS.COMPLETE];
const canCompleteStatus = [TASK_STATUS.PARTIALLY_COMPLETE];

/**
 * 根据用户收藏过滤并批量触发 RSS 下载任务
 * @param {Array<{ rssSubsId: number, [key: string]: any }>} rssSubsArr - 待检查的订阅关联列表
 */
export async function addRssTasksFromFavorites(rssSubsArr) {
    const arr = Array.from(rssSubsArr);
    if (arr.length === 0) return;
    await filterUserRssFavorites(arr.map(o => o.rssSubsId)).then(async data => {
        const favorites = Array.from(data).map(o => o.rssSubscribeId);
        const tasks = arr.filter(o => favorites.includes(o.rssSubsId));
        for (const rssTask of tasks) {
            await addRssTask(rssTask);
        }
    });
}

/**
 * 响应 Webhook 手动触发单个 RSS 结果的下载任务
 * @param {number|string} rssSubsId - 订阅 ID
 * @param {number|string} rssResultId - 抓取结果 ID
 * @returns {Promise<{ id: number, status: string }>}
 */
export async function addRssTaskFromWebhook(rssSubsId, rssResultId) {
    const rssResult = await rssResultRep.selectOneForTaskByIdAndPid(rssResultId, rssSubsId);
    const rssSubs = await rssSubscribeRep.selectOneById(rssSubsId);
    if (!rssResult || !rssSubs) {
        __throwMessage('Invalid rss result.');
    }
    const torrent = await concatTracker(rssResult.torrent, rssResult.tracker);
    const taskInfo = await addRssTask({
        torrent,
        title: rssSubs.name,
        rssSubsId: rssResult.pid,
        resultId: rssResult.id
    });
    return taskInfo ?? __throwMessage('Add task failed.');
}

/**
 * 添加一条 RSS 种子下载任务到 qBittorrent 并落库记录
 * @param {Object} rssTask - 任务载荷
 * @param {string} rssTask.torrent - 种子磁力链或文件链接
 * @param {string} rssTask.title - 资源标题
 * @param {number} rssTask.rssSubsId - 订阅 ID
 * @param {number} rssTask.resultId - 抓取结果 ID
 * @returns {Promise<{ id: number, status: string }|null>}
 */
export async function addRssTask(rssTask) {
    const { torrent, title, rssSubsId, resultId } = rssTask;
    const exists = await rssTaskRep.selectExistsByResultId(resultId);
    if (exists) {
        __log.error(`[RssTask] Add torrent task failed: [${rssSubsId}:${resultId}], Cause exists.`);
        return null;
    } else {
        __log.info(`[RssTask] Add torrent task: [${rssSubsId}:${resultId}] ${title}`);
    }
    let taskId = -1;
    let taskStatus = TASK_STATUS.FAILED;
    let toSaveRssTask = rssTask;
    try {
        const res = await addTorrent(torrent);
        if (!res) {
            __log.error(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) failed. Cause unknown.`);
        } else if (typeof res === 'string') {
            __log.info(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) success. UUID: ${res}`);
            taskStatus = TASK_STATUS.DOWNLOADING;
            toSaveRssTask = { ...rssTask, uuid: res };
        } else {
            __log.info(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) success. Hash: ${res.hash}`);
            taskStatus = TASK_STATUS.DOWNLOADING;
            toSaveRssTask = { ...rssTask, hash: res.hash, uuid: getUUIDByTorrentInfo(res) };
        }
    } catch (e) {
        __log.error(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) failed. Cause: `, e);
    } finally {
        taskId = await saveTask(toSaveRssTask, taskStatus);
    }
    if (TASK_STATUS.DOWNLOADING === taskStatus) {
        const rssResult = await rssResultRep.selectResultTitleById(resultId);
        pushNotification(`[Task Added] ${rssResult?.title}`);
    }
    return { id: taskId, status: taskStatus };
}

/**
 * 处理任务状态流转（开始解析 RESOLVING、完成 COMPLETE、部分完成等）
 * @param {string} uuid - 任务 UUID
 * @param {string} status - 目标状态
 * @returns {Promise<any>}
 */
export async function updateTaskStatus(uuid, status) {
    if (!canUpdateStatus.includes(status)) {
        __throwMessage('Invalid task status.');
    }
    const rssTask = await rssTaskRep.selectByUUID(uuid);
    if (!rssTask) {
        __throwMessage('Unknown task.');
    }
    await rssTaskRep.updateStatusByUUID(uuid, status);
    switch (status) {
        case TASK_STATUS.RESOLVING:
            try {
                return await singleResolveTaskEpisode(rssTask);
            } catch (error) {
                pushNotification(`Resolve rss task error. Please handle it manually. Task UUID: ${uuid}`);
                throw error;
            }
        case TASK_STATUS.COMPLETE:
            __log.info(`[RssTask] Update task status: Complete. Remove torrent task.`);
            await taskCompleted(rssTask);
            break;
        case TASK_STATUS.PARTIALLY_COMPLETE:
            __log.info(`[RssTask] Update task status: Partially Complete.`);
            break;
    }
}

let singleResolve = Promise.resolve();

/**
 * 串行执行任务剧集解析，防止多任务并发争抢或冲突
 * @param {Object} rssTask - 任务对象
 * @returns {Promise<any>}
 */
function singleResolveTaskEpisode(rssTask) {
    const store = Tracer.getStore();
    const currentTask = singleResolve.then(() => Tracer.run(store, () => resolveTaskEpisode(rssTask)));
    singleResolve = currentTask.catch(() => { });
    return currentTask;
}

/**
 * 核心逻辑：解析已下载完成的种子文件（提取剧集、抽取 MKV 字幕与字体、格式转换、入库剧集记录）
 * @param {Object} rssTask - 任务对象
 * @returns {Promise<{ failed: number, skipped: number, result: Array<any> }|undefined>}
 */
async function resolveTaskEpisode(rssTask) {
    const { id, rssSubsId } = rssTask;
    const rssSubs = await rssSubscribeRep.selectOneById(rssSubsId);
    const uuid = rssTask.uuid;
    let hash = rssTask.hash;

    // check torrent info
    const info = await torrentInfo(uuid);
    if (!info) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task info not found.`);
        await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.RESOLVE_FAILED);
        return;
    }

    // check torrent task completion
    if (info.progress !== 1) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task download not complete.`);
        await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.DOWNLOADING);
        __throwMessage(`Task not ready.`);
    }
    hash ??= info.hash;
    const rootPath = info['save_path'] || info['root_path'];
    const fileInfo = await torrentFiles(hash);
    if (!fileInfo) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task files not found.`);
        await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.RESOLVE_FAILED);
        return;
    }

    const files = Array.from(fileInfo);
    const resultArr = [];
    let failedCount = 0;
    let skippedCount = 0;
    for (const fileInfo of files) {
        const fileName = fileInfo.name;
        let simpleFileName = fileInfo.name;
        const priority = parseInt(fileInfo.priority);
        const progress = parseFloat(fileInfo.progress);
        if (priority === 0) {
            __log.warn(`[RssTask] Skip resolve low priority file: ${fileName}`);
            skippedCount++;
            continue;
        }
        if (progress < 1) {
            __log.warn(`[RssTask] Skip resolve file not fully downloaded: ${fileName}`);
            skippedCount++;
            continue;
        }
        const index = simpleFileName.lastIndexOf('/');
        if (index > -1) {
            simpleFileName = simpleFileName.substring(index + 1);
        }
        let filePath = join(rootPath, fileName);
        let ext = path.extname(simpleFileName);
        const animeName = rssSubs.name;
        const episodeFailed = {
            rssTaskId: id,
            rssSubsId,
            rootPath,
            fileName
        };

        const isAnimeExt = isFileExtAnime(ext);

        isAnimeExt || await resolveEpisodeSubtitle(id, rssSubsId, fileName, rootPath, rssSubs.season, animeName, simpleFileName);

        if (!isAnimeExt) {
            __log.error(`[RssTask] Resolve task[${rssTask.id}] file ext failed, cause it's not a video file: ${filePath}`);
            skippedCount++;
            continue;
        }

        // generate episode and validate
        const episode = getAnimeEpisode(simpleFileName);
        if (!episode) {
            __log.error(`[RssTask] Resolve task[${rssTask.id}] file episode failed: ${filePath}`);
            failedCount++;
            episodeFailed.reason = EPISODE_FAILED_REASON.RESOLVE_FAILED;
            await rssEpisodeRep.insertOneFailed(episodeFailed);
            continue;
        }
        episodeFailed.episode = episode;

        // check episode exists
        const exists = await rssEpisodeRep.selectExistsBySubsIdAndEpisode(rssSubsId, episode);
        if (exists) {
            __log.error(`[RssTask] Resolve task[${rssTask.id}] file episode failed. Cause episode[${episode}] exists.`);
            failedCount++;
            episodeFailed.reason = EPISODE_FAILED_REASON.EPISODE_EXISTS;
            await rssEpisodeRep.insertOneFailed(episodeFailed);
            continue;
        }

        if (__env.get('rss.extractMkvSubtitle.enable', false) && ext === '.mkv') {
            const mkvFileName = join(rootPath, fileName);
            __log.info(`[RssTask] Task[${rssTask.id}] file episode file is mkv, ready to extract subtitles: ${mkvFileName}`);
            const { result: extractSubtitles, code: extractSubtitleCode } = await extractMkvSubtitles(mkvFileName);
            if (extractSubtitleCode < 100) {
                episodeFailed.reason = EPISODE_FAILED_REASON.EXTRACT_SUBTITLE_FAILED;
                await rssEpisodeRep.insertOneFailed(episodeFailed);
                failedCount++;
                __log.warn(`[RssTask] Task[${rssTask.id}] episode file extract subtitle failed.`);
                continue;
            }
            // extract subtitles
            const subtitleCount = extractSubtitles.length;
            if (subtitleCount > 0) {
                const subtitleFilePath = mkvFileName + '.subtitle';
                __log.info(`[RssTask] Task[${rssTask.id}] episode file extracted ${subtitleCount} subtitles: ${subtitleFilePath}`);
                // extract fonts
                const { result: extractFonts, code: extractFontCode } = await extractMkvFonts(mkvFileName);
                if (extractFontCode < 100) {
                    episodeFailed.reason = EPISODE_FAILED_REASON.EXTRACT_FONTS_FAILED;
                    await rssEpisodeRep.insertOneFailed(episodeFailed);
                    failedCount++;
                    __log.warn(`[RssTask] Task[${rssTask.id}] episode file extract fonts failed.`);
                    continue;
                }
                const fontsFilePath = mkvFileName + '.font';
                __log.info(`[RssTask] Task[${rssTask.id}] episode file extracted ${extractFonts.length} fonts: ${fontsFilePath}`);
                // resolve subtitles
                let hasFailed = false;
                for (const { file: subtitleFile } of extractSubtitles) {
                    const resolveResult = await resolveEpisodeSubtitle(id, rssSubsId, subtitleFile, subtitleFilePath, rssSubs.season, animeName, subtitleFile, episode);
                    if (!resolveResult.fileRemoved) {
                        hasFailed = true;
                    } else if (resolveResult.missingFonts.length > 0) {
                        __log.info(`[RssTask] Task[${rssTask.id}] subtitle missing fonts:`, ...resolveResult.missingFonts);
                        const backfillFonts = {};
                        for (const missingFont of resolveResult.missingFonts) {
                            const matchFont = matchSubtitleFont(missingFont, extractFonts);
                            if (matchFont && await insertFont(matchFont.fontName, matchFont.file, fontsFilePath)) {
                                backfillFonts[missingFont] = matchFont.fontName;
                            }
                        }
                        await backfillSubtitleFonts(resolveResult.subtitleId, backfillFonts);
                    }
                }
                if (!hasFailed) {
                    __log.info(`[RssTask] Task[${rssTask.id}] all extract subtitle resolved, remove folders:`, subtitleFilePath, fontsFilePath);
                    await removeRemoteEmptyFolders([subtitleFilePath, fontsFilePath]);
                } else {
                    __log.warn(`[RssTask] Task[${rssTask.id}] any extract subtitle resolved failed: ${subtitleFilePath}`);
                }
            }
        }

        if (__env.get('rss.convertMkvToMp4.enable', false) && ext === '.mkv') {
            const mp4FileName = fileName.substring(0, fileName.length - 4) + '.mp4';
            const mp4FilePath = join(rootPath, mp4FileName);
            __log.info(`[RssTask] Task[${rssTask.id}] file episode file is mkv, ready to convert to mp4: ${filePath} -> ${mp4FilePath}`);
            const convertResult = await convertMkvToMp4(filePath, mp4FilePath);
            if (convertResult === 0) {
                episodeFailed.fileName = mp4FileName;
                const originFilePath = filePath;
                filePath = mp4FilePath;
                ext = '.mp4';
                __log.info(`[RssTask] Task[${rssTask.id}] file episode file convert to mp4 success. Remove origin mkv file: ${originFilePath}`);
                await removeRemoteFiles([originFilePath]);
            } else {
                episodeFailed.reason = EPISODE_FAILED_REASON.CONVERT_MKV_TO_MP4_FAILED;
                await rssEpisodeRep.insertOneFailed(episodeFailed);
                failedCount++;
                continue;
            }
        }

        // generate minio link and save
        const minioLink = generateMinioLink(rssSubs.season, animeName, episode, ext);
        episodeFailed.minioLink = minioLink;
        __log.info(`[RssTask] Resolve task[${rssTask.id}] file episode success: ${filePath} ==> ${minioLink}`);
        const rssEpisode = {
            rssTaskId: id,
            rssSubsId,
            episode,
            minioLink,
            filePath,
            status: EPISODE_STATUS.PREPARED
        };
        const { lastId, rows } = await rssEpisodeRep.insertOne(rssEpisode);

        // save failed
        if (rows === 0) {
            __log.error(`[RssTask] Insert task[${rssTask.id}] file episode failed: ${filePath} ==> ${minioLink}. Cause episode[${episode}] exists.`);
            failedCount++;
            episodeFailed.reason = EPISODE_FAILED_REASON.EPISODE_EXISTS;
            await rssEpisodeRep.insertOneFailed(episodeFailed);
            continue;
        }

        // put on result array
        resultArr.push(rssEpisode);
        rssEpisode.id = lastId;
    }

    __log.info(`[RssTask] Resolve task[${rssTask.id}] complete. Success: ${files.length - failedCount - skippedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}.`);

    // update task status
    await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.UPLOADING);

    // build result data
    const data = {
        failed: failedCount,
        skipped: skippedCount,
        result: []
    };
    if (resultArr.length > 0) {
        data.result = resultArr.map(o => ({
            file: o.filePath,
            link: o.minioLink,
            id: o.id
        }));
    }
    return data;
}

/**
 * 任务完成后清理 qBittorrent 标签与种子并推送通知
 * @param {Object} rssTask
 */
async function taskCompleted(rssTask) {
    const uuid = rssTask.uuid;
    let hash = rssTask.hash;

    // check torrent info
    const info = await torrentInfo(uuid);
    if (!info) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task info not found.`);
        return;
    }

    // check torrent task completion
    if (info.progress !== 1) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task download not complete.`);
        __throwMessage(`Task not ready.`);
    }
    hash ??= info.hash;

    await deleteTag(uuid);
    await deleteTorrent(hash);

    const rssResultId = rssTask.rssResultId;
    const rssResult = await rssResultRep.selectResultTitleById(rssResultId);
    pushNotification(`[Torrent Complete] ${rssResult?.title}`);
}

/**
 * 持久化保存下载任务记录
 * @param {Object} rssTask - 任务数据
 * @param {string} [status=TASK_STATUS.FAILED] - 初始状态
 * @returns {Promise<number>} 任务主键 ID
 */
function saveTask(rssTask, status = TASK_STATUS.FAILED) {
    __log.debug(`[RssTask] Save one task, status: ${status}.`);
    return rssTaskRep.insertOne({ ...rssTask, status }).then(res => res.lastId);
}

/**
 * 批量查询种子任务在 qBittorrent 中的下载进度与实时状态
 * @param {number[]} taskIds - 任务 ID 列表
 * @returns {Promise<Array<{ id: number, percent?: string, state?: string }>>}
 */
export async function queryTaskTorrentInfo(taskIds) {
    const tasks = await rssTaskRep.selectByIds(taskIds);
    const toQuery = [];
    const excludes = tasks.filter(t => {
        if (t.hash) {
            toQuery.push(t);
            return false;
        }
        return true;
    });
    setupTasksHashByUUID(excludes);
    const info = await torrentsInfo(toQuery.map(t => t.hash));
    const arr = Array.from(info || []);
    return toQuery.map(t => {
        const result = { id: t.id };
        const obj = arr.find(o => o.hash === t.hash);
        if (obj) {
            result.percent = (obj.progress * 100).toFixed(1) + '%';
            result.state = generateTorrentState(obj);
        }
        return result;
    });
}

/**
 * 针对缺少 hash 的任务根据 UUID 异步查询并回填 hash
 * @param {Array<any>} tasks
 */
async function setupTasksHashByUUID(tasks) {
    const arr = Array.from(tasks);
    if (arr.length === 0) return;
    for (const task of arr) {
        try {
            const { id, uuid } = task;
            const info = await torrentInfo(uuid);
            if (info && info.hash) {
                await rssTaskRep.updateTaskHashById(id, info.hash);
            }
        } catch (error) {
            __log.error(`[RssTask] Setup task[${id}] hash failed.`, error);
        }
    }
}

/**
 * 删除指定的种子任务（清理 qBittorrent 任务及标签）
 * @param {number} taskId - 任务 ID
 * @returns {Promise<ExecResult>}
 */
export async function deleteTask(taskId) {
    const task = await rssTaskRep.selectOneStatusById(taskId);
    if (!canDeleteStatus.includes(task?.status)) {
        __throwMessage('Cannot delete task.');
    }
    await removeCompleteTask(task);
    return rssTaskRep.deleteOneById(taskId);
}

/**
 * 批量删除指定的种子任务（清理 qBittorrent 任务及标签）
 * @param {Array<number>} taskIds - 任务 ID 集合
 * @returns {Promise<{rows: number}>}
 */
export async function deleteTaskBatch(taskIds) {
    if (__isEmptyArray(taskIds)) return { rows: 0 };
    let result = 0;
    for (const taskId of taskIds) {
        try {
            const { rows } = await deleteTask(taskId);
            result += rows;
        } catch (ignored) {
        }
    }
    return { rows: result };
}

/**
 * 暂停指定的下载任务
 * @param {number} taskId - 任务 ID
 * @returns {Promise<void>}
 */
export async function pauseTask(taskId) {
    const tasks = await rssTaskRep.selectByIds([taskId]);
    if (tasks.length === 0) {
        __throwMessage('Task not found.');
    }
    const task = tasks[0];
    if (!task.hash) {
        __throwMessage('Invalid task hash.');
    }
    await stopTorrent([task.hash]);
}

/**
 * 恢复指定的下载任务
 * @param {number} taskId - 任务 ID
 * @returns {Promise<void>}
 */
export async function resumeTask(taskId) {
    const tasks = await rssTaskRep.selectByIds([taskId]);
    if (tasks.length === 0) {
        __throwMessage('Task not found.');
    }
    const task = tasks[0];
    if (!task.hash) {
        __throwMessage('Invalid task hash.');
    }
    await startTorrent([task.hash]);
}

/**
 * 手动将部分完成的任务标记为全部完成并清理种子
 * @param {number} taskId - 任务 ID
 * @returns {Promise<ExecResult>}
 */
export async function completeTask(taskId) {
    const task = await rssTaskRep.selectOneStatusById(taskId);
    if (!canCompleteStatus.includes(task?.status)) {
        __throwMessage('Cannot complete task.');
    }
    await removeCompleteTask(task);
    return rssTaskRep.updateStatusById(taskId, TASK_STATUS.COMPLETE);
}

/**
 * 校验任务状态并在停止状态下移除 qBittorrent 种子与标签
 * @param {Object} task
 */
async function removeCompleteTask(task) {
    const uuid = task.uuid;
    let hash = task.hash;
    const info = await torrentInfo(uuid);
    if (!info) {
        __log.warn(`[RssTask] Task torrent info[${task.id}] not found.`);
    } else if (!TORRENT_STOPPED_STATE.includes(info.state)) {
        __log.error(`[RssTask] Cannot delete torrent task[${task.id}]. Cause torrent state[${info.state}] not stopped.`);
        __throwMessage('Task state not stopped.');
    } else {
        hash ??= info.hash;
        await deleteTag(uuid);
        await deleteTorrent(hash, true);
    }
}