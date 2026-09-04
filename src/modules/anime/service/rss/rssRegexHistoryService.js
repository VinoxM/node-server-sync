import rssRegexHistoryRep from '#modules/anime/repository/rss/rssRegexHistoryRep.js';

const incrStep = Math.pow(10, 10);

/**
 * 获取高频使用的 RSS 正则表达式历史列表
 * @returns {Promise<string[]>}
 */
export async function getRssRegex() {
    const limit = __env.get('rss.regex.historyLimit', 10);
    return rssRegexHistoryRep.selectByRank(limit).then(res => res.data.map(obj => (obj.regex)));
}

/**
 * 记录或增加一条 RSS 正则表达式的使用权重与时间戳
 * @param {string} regex - 正则表达式字符串
 * @returns {Promise<ExecResult>}
 */
export async function addRssRegex(regex) {
    let score = await rssRegexHistoryRep.selectScoreByRegex(regex);
    const isInsert = score === null;
    if (score !== null) {
        const scoreTemp = "" + score;
        score = parseInt(scoreTemp.substring(0, scoreTemp.length - 10));
    } else score = 0;
    const timestamp = Math.floor(new Date().getTime() / 1000);
    score = (score + 1) * incrStep + timestamp;
    return isInsert ? rssRegexHistoryRep.insertRegex(regex, score) : rssRegexHistoryRep.updateRegex(regex, score);
}