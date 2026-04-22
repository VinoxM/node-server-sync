import path from 'path'
import { getAnimeEpisode } from './rssEpisodeService.js';
import { getMinioClient } from '../../../core/instance/minioClient.js';
import { GetterContextSubscribe } from '../../../core/context/subscribe.js';
import rssSubtitleRep from '../repository/rssSubtitleRep.js';
import { RSS_SUBTITLE_FILE_STATUS, RSS_SUBTITLE_STATUS } from '../constants/rssSubtitleStatusConst.js';
import { SSH_CMD_BATCH_DELETE_SIMPLE, SSH_CMD_MINIO_COPY_SCRIPT_U_QBIT } from '../../../common/constants/sshScriptsConst.js';
import { getSSHExecutor } from '../../../core/instance/sshExecutor.js';
import { pushNotification } from '../../../api/sockets/notification.js';

const rssSubtitleMatchers = new GetterContextSubscribe('RssSubtitleMatchers', () => __env.get('rss.subtitleMatchers', []))
export function getRssSubtitleMatchers() {
    return rssSubtitleMatchers.getValue() || []
}

function isFileExtSubtitle(ext) {
    const reg = __env.get('rss.subtitleExtRegex')
    if (__isBlank(reg)) {
        __log.warn(`[RssEpisode] Get rss subtitle ext regex empty. Skipped validate file ext.`)
        return false;
    }
    try {
        return new RegExp(reg, 'i').test(ext)
    } catch (error) {
        __log.error(`[RssEpisode] Validate subtitle ext failed. Regex: ${reg}`, error)
        return false
    }
}

function generateSubtitleMinioLink(season, animeName, episode, fileName) {
    return `/anime/${season}/${animeName}/${episode}/${fileName}`
}

function generateSubtitleTitle(fileName) {
    let title = null
    getRssSubtitleMatchers().some(match => {
        const exec = new RegExp(match, 'i').exec(fileName);
        if (exec !== null) {
            title = exec[1];
            return true;
        }
        return false;
    })
    return title
}

export async function resolveEpisodeSubtitle(taskId, subsId, fileName, rootPath, season, animeName) {
    let result = false
    const ext = path.extname(fileName)
    if (!isFileExtSubtitle(ext)) return result;
    const filePath = path.join(rootPath, fileName)
    const fileExists = await rssSubtitleRep.selectExistsByFileNameAndRootPath(fileName, rootPath);
    if (fileExists) {
        __log.warn(`[RSS Subtitle] Skip resolve episode subtitle, cause resolved. File path: ${filePath}`)
        return result;
    }
    result = true;
    const episodeSubtitle = {
        taskId,
        subsId,
        fileName,
        rootPath
    }
    const episode = getAnimeEpisode(fileName);
    if (episode !== null) {
        episodeSubtitle.episode = episode
        episodeSubtitle.minioLink = generateSubtitleMinioLink(season, animeName, episode, fileName)
    }
    // generate episode subtitle's title
    episodeSubtitle.title = generateSubtitleTitle(fileName)
    // insert episode subtitle
    const { lastId: subtitleId } = await rssSubtitleRep.insertOne(episodeSubtitle)

    if (!episodeSubtitle.minioLink) return result;
    // copy episode subtitle to minio
    const complete = await uploadSubtitleToMinio(filePath, episodeSubtitle.minioLink, subtitleId)
    if (!complete) {
        __log.warn(`[RSS Subtitle] Upload subtitle[${subtitleId}] to minio failed.`)
        return result;
    }

    const deleted = await removeRemoteServerFile([filePath])
    deleted < 0 || await rssSubtitleRep.updateSubtitleFileStatusById(subtitleId, RSS_SUBTITLE_FILE_STATUS.REMOVED)
    if (ext === '.srt') {
        const newMinioLink = await convertMinioSrtToVtt(episodeSubtitle.minioLink)
        newMinioLink && await rssSubtitleRep.updateSubtitleMinioLinkById(subtitleId, newMinioLink)
    } else if (ext === '.ass') {
        const fonts = await getMinioAssFonts(episodeSubtitle.minioLink)
        fonts && await rssSubtitleRep.updateSubtitleFontsById(subtitleId, fonts.join(','))
    }
    return result;
}

export async function retryUploadEpisodeSubtitle(id) {
    // get episode subtitle from repository
    const subtitle = await rssSubtitleRep.selectOneById(id)
    subtitle || __throwMessage('Rss episode subtitle not exists.')
    const { rootPath, fileName, minioLink, status, fileStatus } = subtitle
    status === RSS_SUBTITLE_STATUS.FAILED || __throwMessage('Cannot retry subtitle upload.')
    fileStatus === RSS_SUBTITLE_FILE_STATUS.REMOVED && __throwMessage('Subtitle file removed.')
    const filePath = path.join(rootPath, fileName)
    __isBlank(minioLink) && __throwMessage('Minio link is blank.')
    const complete = await uploadSubtitleToMinio(filePath, minioLink, id)

    complete || __throwMessage('Upload to minio failed.')
    const deleted = await removeRemoteServerFile([filePath])
    deleted < 0 || await rssSubtitleRep.updateSubtitleFileStatusById(id, RSS_SUBTITLE_FILE_STATUS.REMOVED)
    const ext = path.extname(fileName)
    if (ext === '.srt') {
        const newMinioLink = await convertMinioSrtToVtt(minioLink)
        newMinioLink && await rssSubtitleRep.updateSubtitleMinioLinkById(id, newMinioLink)
    } else if (ext === '.ass') {
        const fonts = await getMinioAssFonts(minioLink)
        fonts && await rssSubtitleRep.updateSubtitleFontsById(id, fonts.join(','))
    }
}

export async function updateEpisodeSubtitle(id, episode, title, fonts) {
    // get episode subtitle from repository
    const subtitle = await rssSubtitleRep.selectOneById(id)
    subtitle || __throwMessage('Rss episode subtitle not exists.')
    await rssSubtitleRep.updateSubtitleEpisodeById(id, episode)
    await rssSubtitleRep.updateSubtitleTitleById(id, title)
    __isNotEmptyArray(fonts) && await rssSubtitleRep.updateSubtitleFontsById(id, fonts?.join(',') || null)
}

export async function deleteEpisodeSubtitle(subtitleId) {
    // get episode subtitle from repository
    const subtitle = await rssSubtitleRep.selectOneById(subtitleId)
    subtitle || __throwMessage('Rss episode subtitle not exists.')
    // update episode subtitle status to removed
    await rssSubtitleRep.updateSubtitleStatusById(subtitleId, RSS_SUBTITLE_STATUS.REMOVED)
    // check episode subtitle minio status 
    if (subtitle.status === RSS_SUBTITLE_STATUS.COMPLETE) {
        await deleteMinioObject(subtitle.minioLink)
    }
    const deleted = await deleteEpisodeSubtitleFileInternal(subtitle)
    // delete episode subtitle from repository
    deleted < 0 || await rssSubtitleRep.deleteOneById(subtitle.id)
}

export async function deleteEpisodeSubtitleFile(subtitleId) {
    // get episode subtitle from repository
    const subtitle = await rssSubtitleRep.selectOneById(subtitleId)
    subtitle || __throwMessage('Episode subtitle not exists.')
    const deleted = await deleteEpisodeSubtitleFileInternal(subtitle)
    deleted < 0 || await rssSubtitleRep.updateSubtitleFileStatusById(subtitleId, RSS_SUBTITLE_FILE_STATUS.REMOVED)
}

export async function recalculateEpisodeSubtitleFonts(subtitleId) {
    // get episode subtitle from repository
    const subtitle = await rssSubtitleRep.selectOneById(subtitleId)
    subtitle || __throwMessage('Episode subtitle not exists.')
    const { minioLink } = subtitle
    __isNotBlank(minioLink) || __throwMessage('Episode subtitle minio link is blank.')
    if (minioLink.endsWith('.ass')) {
        const fonts = await getMinioAssFonts(minioLink)
        fonts && await rssSubtitleRep.updateSubtitleFontsById(subtitleId, fonts.join(','))
    }
}

async function deleteEpisodeSubtitleFileInternal(subtitle) {
    // check episode subtitle file status 
    const fileStatus = subtitle.fileStatus
    if (fileStatus !== RSS_SUBTITLE_FILE_STATUS.EXISTS) return 1
    const rootPath = subtitle.rootPath;
    const fileName = subtitle.fileName;
    if (__isAnyBlank(rootPath, fileName)) return 1
    const filePath = path.join(rootPath, fileName)
    // delete episode subtitle file
    return await removeRemoteServerFile([filePath])
}

async function removeRemoteServerFile(files) {
    __log.info(`Ready to delete files: `, files)
    const executor = getSSHExecutor('fedora')
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

async function uploadSubtitleToMinio(filePath, minioLink, subtitleId) {
    await rssSubtitleRep.updateSubtitleStatusById(subtitleId, RSS_SUBTITLE_STATUS.UPLOADING)
    const result = await executeSshScript(filePath, minioLink, SSH_CMD_MINIO_COPY_SCRIPT_U_QBIT)
    const complete = result === 1
    const status = complete ? RSS_SUBTITLE_STATUS.COMPLETE : RSS_SUBTITLE_STATUS.FAILED
    await rssSubtitleRep.updateSubtitleStatusById(subtitleId, status)
    return complete
}

async function executeSshScript(resourcePath, minioLink, script) {
    const client = getMinioClient()
    if (!client?.ready()) {
        logAndPushNotification(`Upload subtitle minio object failed. Cause client not ready.`)
        return -1
    }
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    const executor = getSSHExecutor('fedora')
    if (!executor) return -2
    try {
        const { code } = await executor.exec(script, [resourcePath, suitableMinioLink]);
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ssh script failed.', e)
        return -3
    }
}

async function convertMinioSrtToVtt(srtMinioLink = '') {
    if (__isBlank(srtMinioLink) || !srtMinioLink?.endsWith('.srt')) return null;
    const client = getMinioClient()
    if (!client?.ready()) return null;
    const vttMinioLink = srtMinioLink.substring(0, srtMinioLink.length - 4) + '.vtt'
    __log.info(`[RSS Subtitle] Ready to convert minio file srt to vtt. ${srtMinioLink} -> ${vttMinioLink}`)
    try {
        const dataStream = await client.getObject(srtMinioLink);
        let srtContent = '';
        for await (const chunk of dataStream) {
            srtContent += chunk.toString();
        }
        const vttContent = 'WEBVTT\n\n' + srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        const vttBuffer = Buffer.from(vttContent, 'utf-8');
        const res = await client.putObject(vttMinioLink, vttBuffer, { 'Content-Type': 'text/vtt' })
        if (res) {
            __log.info(`[RSS Subtitle] Convert minio file srt to vtt success.`)
            await client.deleteObject(srtMinioLink);
            return vttMinioLink;
        }
    } catch (error) {
        __log.error(`[RSS Subtitle] Convert minio file srt to vtt failed.`, error)
    }
    return null;
}

async function getMinioAssFonts(minioLink = '') {
    if (__isBlank(minioLink) || !minioLink?.endsWith('.ass')) return null;
    const client = getMinioClient()
    if (!client?.ready()) return null;
    try {
        const dataStream = await client.getObject(minioLink);
        let content = '';
        for await (const chunk of dataStream) {
            content += chunk.toString();
        }

        const fontSet = new Set();

        const styleRegex = /^Style:\s*[^,]+,([^,]+)/gm;
        let match;
        while ((match = styleRegex.exec(content)) !== null) {
            fontSet.add(match[1].trim());
        }

        const inlineRegex = /\\fn([^\\}]+)/g;
        while ((match = inlineRegex.exec(content)) !== null) {
            fontSet.add(match[1].trim());
        }

        return Array.from(fontSet);
    } catch (error) {
        __log.error(`[RSS Subtitle] Get minio ass file's fonts failed.`, error)
    }
    return null;
}

async function deleteMinioObject(minioLink) {
    if (__isBlank(minioLink)) return
    const client = getMinioClient()
    client?.ready() || __throwMessage('Minio client not ready.')
    return await client.deleteObject(minioLink);
}

function logAndPushNotification(message, id) {
    const msg = (__isNotBlank(id) ? `[${id}] ` : '') + `${message}`
    __log.error(msg)
    pushNotification(msg)
}