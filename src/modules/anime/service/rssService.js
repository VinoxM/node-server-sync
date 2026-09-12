import rssEpisodeRep from '#modules/anime/repository/rss/rssEpisodeRep.js';
import rssSubtitleRep from '#modules/anime/repository/rss/rssSubtitleRep.js';
import { generateMinioSourceSafely } from '#modules/media/service/mediaMinioService.js';
import rssFontsRep from '#modules/anime/repository/rss/rssFontsRep.js';
import subscribeRep from '#modules/anime/repository/subscribeRep.js';
import subjectsRep from '#modules/anime/repository/subjectsRep.js';

export async function getRssCardFailedViews() {
    const episodeFailedCount = await rssEpisodeRep.selectFailedCount();
    const subtitleFailedCount = await rssSubtitleRep.selectFailedCount();
    return {
        episodeFailedCount,
        subtitleFailedCount
    }
}

export async function getRssEpisodeSource(rssSubsId, episode) {
    const subject = await subjectsRep.selectOneVisibleBySubsId(rssSubsId)
    subject || __throwMessage('Subject not exists.');
    const title = __isNotBlank(subject.nameCN) ? subject.nameCN : subject.name;
    const sourcesData = await rssEpisodeRep.selectSourceBySubsIdAndEpisode(rssSubsId, episode)
    const episodeData = sourcesData?.data?.find(r => r.episode === episode)
    const result = { url: null, subtitles: [], unsupportedFonts: [], title: null, sources: sourcesData?.data.map(d => ({ episode: d.episode, title: `${title} - ${d.episode}` })) }
    if (!episodeData?.minioLink) return result
    result.url = generateMinioSourceSafely(episodeData.minioLink)
    result.title = `${title} - ${episode}`
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

export async function getSubscribeBySubjectId(subjectId) {
    const subscribe = await subscribeRep.selectBySubjectId(subjectId);
    if (!subscribe) return subscribe;
    const { regex, nameAlias, ...rest } = subscribe;
    return {
        ...rest,
        regex: JSON.parse(regex || '[]'),
        nameAlias: JSON.parse(nameAlias || '[]')
    }
}

export async function updateSubscribe(body) {
    const { subsId, ...rest } = body;
    return subscribeRep.updateOne({ ...rest, id: subsId });
}