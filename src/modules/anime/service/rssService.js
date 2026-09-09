import rssEpisodeRep from '#modules/anime/repository/rss/rssEpisodeRep.js';
import rssSubtitleRep from '#modules/anime/repository/rss/rssSubtitleRep.js';
import { generateMinioSourceSafely } from '#modules/media/service/mediaMinioService.js';
import rssFontsRep from '#modules/anime/repository/rss/rssFontsRep.js';
import rssSubscribeRep from '#modules/anime/repository/rss/rssSubscribeRep.js';

export async function getRssCardFailedViews() {
    const episodeFailedCount = await rssEpisodeRep.selectFailedCount();
    const subtitleFailedCount = await rssSubtitleRep.selectFailedCount();
    return {
        episodeFailedCount,
        subtitleFailedCount
    }
}

export async function getRssEpisodeSource(rssSubsId, episode) {
    const sourcesData = await rssEpisodeRep.selectSourceBySubsIdAndEpisode(rssSubsId, episode)
    const episodeData = sourcesData?.data?.find(r => r.episode === episode)
    const result = { url: null, subtitles: [], unsupportedFonts: [], title: null, sources: sourcesData?.data.map(d => ({ episode: d.episode, title: `${d.title} - ${d.episode}` })) }
    if (!episodeData?.minioLink) return result
    result.url = generateMinioSourceSafely(episodeData.minioLink)
    result.title = __isBlank(episodeData.title) ? null : `${episodeData.title} - ${episode}`
    const { data, rows } = await rssSubtitleRep.selectBySubsIdAndEpisode(rssSubsId, episode)
    if (rows === 0) return result
    const unsupportedFontSet = new Set()
    for (const subtitle of data) {
        const { minioLink, fonts, title } = subtitle
        const obj = { url: generateMinioSourceSafely(minioLink), fonts, title }
        if (__isNotBlank(fonts)) {
            const fontNameArr = fonts.split(',')
            const fontArr = await rssFontsRep.selectByTitles(fontNameArr)
            fontNameArr.forEach(f => fontArr.some(_f => _f.title === f) || unsupportedFontSet.add(f))
            obj.fonts = fontArr.map(f => generateMinioSourceSafely(f.minioLink))
        }
        result.subtitles.push(obj)
    }
    result.unsupportedFonts = Array.from(unsupportedFontSet)
    return result;
}

export async function getEpisodeExistsSubscriptions(body) {
    const { season, title, pageNum = 1, pageSize = 20 } = body
    const record = await rssSubscribeRep.selectEpisodesExistsSubsForSearch(season, title, pageSize, pageNum).then(({ data }) => data)
    const total = await rssSubscribeRep.selectEpisodesExistsSubsForCount(season, title)
    return { record, total, pageNum, pageSize }
}
