import rssRegexHistoryRep from '../../repository/rss/rssRegexHistoryRep.js';

const { selectByRank, insertRegex, updateRegex, selectScoreByRegex } = rssRegexHistoryRep;

const incrStep = Math.pow(10, 10);

export function getRssRegex() {
    const limit = __env.get('rss.regex.historyLimit', 10);
    return selectByRank(limit).then(res => res.data.map(obj => (obj.regex)));
}

export async function addRssRegex(regex) {
    let score = await selectScoreByRegex(regex);
    const isInsert = score === null;
    if (score !== null) {
        const scoreTemp = "" + score;
        score = parseInt(scoreTemp.substring(0, scoreTemp.length - 10));
    } else score = 0;
    const timestamp = Math.floor(new Date().getTime() / 1000);
    score = (score + 1) * incrStep + timestamp;
    return isInsert ? insertRegex(regex, score) : updateRegex(regex, score);
}