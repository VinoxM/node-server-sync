import apiBodyConst from '../../common/constants/apiBodyConst.js';
import apiMethodConst from '../../common/constants/apiMethodConst.js';
import { checkBodyKeyNotBlank } from '../../common/utils/preCheckUtil.js';
import { cancelJob, emitJob, startSchedule } from '../../jobs/schedule/index.js';

const { POST } = apiMethodConst;
const { JOB_NAME } = apiBodyConst;

const needSecret = () => "mAou5820.schedule"

export default {
    basePath: "/schedule",
    "/restartJobs": {
        method: POST,
        needSecret,
        callback: () => {
            return startSchedule();
        }
    },
    "/cancelJob": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, JOB_NAME),
        callback: (req) => {
            const jobName = req.body[JOB_NAME];
            return cancelJob(jobName);
        }
    },
    "/emitJob": {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, JOB_NAME),
        callback: (req) => {
            const jobName = req.body[JOB_NAME];
            return emitJob(jobName)
        }
    }
}