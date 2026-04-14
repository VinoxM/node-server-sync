import apiMethodConst from "../../../common/constants/apiMethodConst.js";
import apiBodyConst from "../../../common/constants/apiBodyConst.js";
import { checkBodyKeyNotBlank } from "../../../common/utils/preCheckUtil.js";
import { addRssRegex, getRssRegex } from "../../../modules/rss/service/rssRegexHistoryService.js";

const { REGEX } = apiBodyConst;
const { GET, POST } = apiMethodConst;

export default {
    basePath: "/rss",
    "/regex/history": {
        method: GET,
        callback: () => {
            return getRssRegex();
        }
    },
    "/regex/add": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, REGEX),
        callback: async (req) => {
            const regex = req.body[REGEX];
            return addRssRegex(regex).then(() => null);
        }
    }
}