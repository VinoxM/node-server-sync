import rssEpisodeRep from '#modules/anime/repository/rss/rssEpisodeRep.js';
import rssSubtitleRep from '#modules/anime/repository/rss/rssSubtitleRep.js';
import { generateMinioSourceSafely } from '#modules/media/service/mediaMinioService.js';
import rssFontsRep from '#modules/anime/repository/rss/rssFontsRep.js';
import subscribeRep from '#modules/anime/repository/subscribeRep.js';
import subjectsRep from '#modules/anime/repository/subjectsRep.js';
import { getAnimeProgress } from '#modules/anime/service/animeProgressService.js';

/**
 * 获取 RSS 异常处理卡片概览数量（解析失败剧集数与字幕失败数）
 * @returns {Promise<{ episodeFailedCount: number, subtitleFailedCount: number }>}
 */
export async function getRssCardFailedViews() {
    const episodeFailedCount = await rssEpisodeRep.selectFailedCount();
    const subtitleFailedCount = await rssSubtitleRep.selectFailedCount();
    return {
        episodeFailedCount,
        subtitleFailedCount
    };
}

/**
 * 根据订阅 ID 和集数获取视频播放源、内嵌字幕及关联字体资源
 * @param {number|string} rssSubsId - 订阅 ID
 * @param {number|string} episode - 集数/话数
 * @returns {Promise<{ url: string|null, subtitles: Array<{ url: string, fonts: Array<string>, title: string }>, unsupportedFonts: string[], title: string|null, sources: Array<{ episode: number|string, title: string }>, currentTime: number|null }>}
 */
export async function getRssEpisodeSource(rssSubsId, episode, userInfo) {
    const subject = await subjectsRep.selectOneVisibleBySubsId(rssSubsId);
    subject || __throwMessage('Subject not exists.');
    const title = __isNotBlank(subject.nameCN) ? subject.nameCN : subject.name;
    const sourcesData = await rssEpisodeRep.selectSourceBySubsIdAndEpisode(rssSubsId, episode);
    const episodeData = sourcesData?.data?.find(r => r.episode === episode);
    const result = {
        url: null,
        subtitles: [],
        unsupportedFonts: [],
        title: null,
        sources: sourcesData?.data.map(d => ({ episode: d.episode, title: `${title} - ${d.episode}` }))
    };
    if (!episodeData?.minioLink) return result;
    result.url = generateMinioSourceSafely(episodeData.minioLink);
    result.title = `${title} - ${episode}`;
    const progressData = await getAnimeProgress(userInfo, subject.id, episode);
    result.currentTime = progressData?.currentTime;
    const { data, rows } = await rssSubtitleRep.selectBySubsIdAndEpisode(rssSubsId, episode);
    if (rows === 0) return result;
    const unsupportedFontSet = new Set();
    for (const subtitle of data) {
        const { minioLink, fonts, title } = subtitle;
        const obj = { url: generateMinioSourceSafely(minioLink), fonts, title };
        if (__isNotBlank(fonts)) {
            const fontNameArr = fonts.split(',');
            const fontArr = await rssFontsRep.selectByTitles(fontNameArr);
            fontNameArr.forEach(f => fontArr.some(_f => _f.title === f) || unsupportedFontSet.add(f));
            obj.fonts = fontArr.map(f => generateMinioSourceSafely(f.minioLink));
        }
        result.subtitles.push(obj);
    }
    result.unsupportedFonts = Array.from(unsupportedFontSet);
    return result;
}

/**
 * 根据番剧 ID 获取对应的订阅规则配置
 * @param {number|string} subjectId - 番剧 ID
 * @returns {Promise<any>}
 */
export async function getSubscribeBySubjectId(subjectId) {
    const subscribe = await subscribeRep.selectBySubjectId(subjectId);
    if (!subscribe) return subscribe;
    const { regex, nameAlias, ...rest } = subscribe;
    return {
        ...rest,
        regex: JSON.parse(regex || '[]'),
        nameAlias: JSON.parse(nameAlias || '[]')
    };
}

/**
 * 更新番剧订阅配置
 * @param {Object} body - 订阅更新载荷
 * @param {number|string} body.subsId - 订阅 ID
 * @returns {Promise<{ rows: number }>}
 */
export async function updateSubscribe(body) {
    const { subsId, ...rest } = body;
    return subscribeRep.updateOne({ ...rest, id: subsId });
}