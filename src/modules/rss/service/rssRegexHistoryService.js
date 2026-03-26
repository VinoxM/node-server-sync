import rssRegexHistoryRep from '../repository/rssRegexHistoryRep.js';

const incrStep = Math.pow(10, 10);

export function getRssRegex() {
    const limit = __env.get('rss.regex.historyLimit', 10);
    return rssRegexHistoryRep.selectByRank(limit).then(res => res.data.map(obj => (obj.regex)));
}

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