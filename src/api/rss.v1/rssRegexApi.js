import apiMethodConst from '../../constraints/apiMethodConst.js';
import apiBodyConst from '../../constraints/apiBodyConst.js';
import { addRssRegex, getRssRegex } from '../../handler/rss/rssRegexHistoryHandler.js';
import { checkBodyKeyNotBlank } from '../../common/apiPreCheck.js';

const { REGEX } = apiBodyConst;
const { GET, POST } = apiMethodConst;

export default {
    basePath: "/rss",
    "/regex/history": {
        method: GET,
        ignoreOutput: true,
        callback: () => {
            return getRssRegex();
        }
    },
    "/regex/add": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, REGEX),
        callback: (req) => {
            const regex = req.body[REGEX];
            return addRssRegex(regex).then(() => null);
        }
    }
}