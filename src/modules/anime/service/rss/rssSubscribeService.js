import Parser from 'rss-parser';
import rssSubscribeRep from '#modules/anime/repository/rss/rssSubscribeRep.js';
import { getUrlContent } from '#utils/httpUtil.js';

const rssXMLParser = {
    value: null,
    parse: async content => {
        rssXMLParser.value ??= new Parser();
        return rssXMLParser.value.parseString(content);
    }
};

/**
 * 抓取指定 RSS 订阅 URL 文本，解析 XML 并根据正则规则过滤出条目列表
 * @param {Object} obj - 订阅配置
 * @param {number} obj.id - 订阅 ID
 * @param {string} obj.url - RSS 订阅 XML 地址
 * @param {string} [obj.regex] - 过滤规则正则表达式 JSON 字符串
 * @returns {Promise<Array<{ pid: number, title: string, pubDate: string, torrent: string }>>}
 */
export async function analysisRssSubscribe(obj) {
    if (!obj) return [];
    const { id, url, regex } = obj;
    __log.debug(`[RssSubscribe Handler] Analysis RSS url: ${decodeURI(url)}`);
    try {
        const content = await getUrlContent(url);
        const parsed = await rssXMLParser.parse(content);
        const results = parsed.items ? (Array.isArray(parsed.items) ? parsed.items : [parsed.items]) : [];
        return results.filter(item => {
            if (__isNotBlank(regex)) {
                const regexArray = JSON.parse(regex);
                return regexArray.every(reg => new RegExp(reg).test(item?.title || ''));
            }
            return true;
        }).map(item => ({
            pid: id,
            title: item.title,
            pubDate: item.pubDate,
            torrent: item.enclosure.url
        }));
    } catch (err) {
        const idStr = __isNotBlank(id) ? `[${id}]` : '';
        __log.error(`[RssSubscribe Handler] Analysis Error: ${idStr}${decodeURI(url)} , Cause:`, err.message ?? err);
        throw err;
    }
}

/**
 * 校验指定订阅是否可安全删除（不存在已关联的剧集）
 * @param {number} id - 订阅 ID
 * @returns {Promise<boolean>}
 */
export async function canDeleteSubscribe(id) {
    return (await rssSubscribeRep.selectEpisodesExistsSubsBySubsId(id)) === 0;
}