import { getLatestStorageSummary, storageSummaryDimensions } from "../../../modules/statistics/service/storageSummaryService.js";
import apiMethodConst from "../../../common/constants/apiMethodConst.js";

const { POST, GET } = apiMethodConst;

const needSecret = () => "mAou5820.summary";

export default {
    basePath: "/summary",    
    "/storage/doSummary": {
        method: POST,
        needSecret,
        needAuth: true,
        callback: () => storageSummaryDimensions()
    },
    '/storage/getLatestDimensions': {
        method: GET,
        needSecret,
        callback: () => getLatestStorageSummary()
    }
}
