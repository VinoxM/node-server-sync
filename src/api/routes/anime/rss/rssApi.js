import { allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeyMatch, checkBodyKeysNotBlank, checkQueryKeyMatchIfPresent, checkQueryKeyNotBlank } from "#utils/preCheckUtil.js";
import { generateMinioSourceSafely } from "#modules/media/service/mediaMinioService.js";
import rssEpisodeRep from "#modules/rss/repository/rssEpisodeRep.js";
import rssFontsRep from "#modules/rss/repository/rssFontsRep.js";
import rssSubscribeRep from "#modules/rss/repository/rssSubscribeRep.js";
import rssSubtitleRep from "#modules/rss/repository/rssSubtitleRep.js";
import { defineRoutes } from "#common/utils/defineUtil.js";

const { GET, POST } = apiMethodConst

export default defineRoutes({
    basePath: "/anime/rss",
    '/getEpisodeExistsSubscriptions': {
        method: POST,
        needAuth: true,
        needSecret: () => "mAou5820.subscribe",
        callback: async req => {
            const { season, title, pageNum = 1, pageSize = 20 } = req.body
            const record = await rssSubscribeRep.selectEpisodesExistsSubsForSearch(season, title, pageSize, pageNum).then(({ data }) => data)
            const total = await rssSubscribeRep.selectEpisodesExistsSubsForCount(season, title)
            return { record, total, pageNum, pageSize }
        }
    },
    '/getRssCardFailedViews': {
        method: GET,
        needAuth: true,
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        needSecret: () => "mAou5820.subscribe",
        callback: async () => {
            const episodeFailedCount = await rssEpisodeRep.selectFailedCount();
            const subtitleFailedCount = await rssSubtitleRep.selectFailedCount();
            return {
                episodeFailedCount,
                subtitleFailedCount
            }
        }
    },
    "/getRssEpisodeSource": {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret: () => "mAou5820.subscribe",
        preCheck: (req) => checkBodyKeysNotBlank(req, ['rssSubsId', 'episode']),
        callback: async req => {
            const { rssSubsId, episode } = req.body
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
    }
});