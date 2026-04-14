import apiMethodConst from "../../../common/constants/apiMethodConst.js";
import rssTrackerRep from "../../../modules/rss/repository/rssTrackerRep.js";

const { GET } = apiMethodConst;

export default {
    basePath: "/rss/tracker",    
    "/getAll": {
        disabled: true,
        method: GET,
        callback: () => {
            return rssTrackerRep.selectAll().then(({ data }) => data);
        }
    }
}