import apiMethodConst from '../../constraints/apiMethodConst.js';
import rssTrackerRep from '../../repository/rss/rssTrackerRep.js';

const { GET } = apiMethodConst;

export default {
    basePath: "/rss/tracker",    
    "/getAll": {
        method: GET,
        ignoreOutput: true,
        callback: () => {
            return rssTrackerRep.selectAll().then(({ data }) => data);
        }
    }
}