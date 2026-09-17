import Parser from 'rss-parser';
import { getUrlContent } from '#utils/httpUtil.js';
import subscribeRep from '#modules/anime/repository/subscribeRep.js';
import subjectsRep from '#modules/anime/repository/subjectsRep.js';

/**
 * RSS XML 解析器单例容器
 */
const rssXMLParser = {
    value: null,
    /**
     * 解析 XML 内容为 RSS 对象
     * @param {string} content - XML 字符串
     * @returns {Promise<any>}
     */
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
 * 为指定番剧条目创建默认订阅记录
 * @param {number|string} subjectId - 番剧主键 ID
 * @returns {Promise<number>} 插入影响行数
 */
export async function createSubscribeBySubjectId(subjectId) {
    const subject = await subjectsRep.selectOneById(subjectId);
    subject || __throwMessage('Subject not exists.');
    const { season, airDate, bangumiId } = subject;
    const startTime = __isNotBlank(airDate) ? new Date(airDate) : new Date(season + '-01');
    const res = await subscribeRep.insertOne({ bangumiId, startTime });
    return res.rows;
}

export async function resetVectorStatusByBangumiIds(bangumiIds) {

}