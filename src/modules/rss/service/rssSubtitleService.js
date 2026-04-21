import path from 'path'
import { getAnimeEpisode } from './rssEpisodeService.js';

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

export async function resolveEpisodeSubtitle(taskId, subsId, fileName, rootPath, season, animeName) {
    const ext = path.extname(fileName)
    if (!isFileExtSubtitle(ext)) return;
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
    // TODO: generate episode subtitle's title

    // TODO: insert episode subtitle

    // TODO: copy episode subtitle to minio

    // TODO: update episode subtitle status

    // TODO: remove file if copy success
    const filePath = path.join(rootPath, fileName)
    await removeRemoteServerFile([filePath])
    // TODO: update episode subtitle file status

    // TODO: resolve episode subtitle fonts

    // TODO: update episode subtitle fonts

}

export async function updateEpisodeSubtitle() {
    // TODO 
}

export async function deleteEpisodeSubtitle(subtitleId) {
    // TODO: get episode subtitle from repository
    const subtitle = null
    // TODO: update episode subtitle status to removed

    // TODO: check episode subtitle minio status 

    // TODO: delete episode subtitle minio

    await deleteEpisodeSubtitleFileInternal(subtitle)

    // TODO: delete episode subtitle from repository

}

export async function deleteEpisodeSubtitleFile(subtitleId) {
    // TODO: get episode subtitle from repository
    const subtitle = null
    subtitle || __throwMessage('Episode subtitle not exists.')
    await deleteEpisodeSubtitleFileInternal(subtitle)
}

async function deleteEpisodeSubtitleFileInternal(subtitle) {
    // TODO: check episode subtitle file status 

    const filePath = null
    // TODO: delete episode subtitle file
    await removeRemoteServerFile([filePath])
    // TODO: update episode subtitle file status

}

async function removeRemoteServerFile(files) {

}