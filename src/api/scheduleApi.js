import apiMethodConst from '../constraints/apiMethodConst.js';
import apiBodyConst from '../constraints/apiBodyConst.js';
import { checkBodyKeyNotBlank } from '../common/apiPreCheck.js';
import { startSchedule, cancelJob, emitJob } from '../schedule/index.js';

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