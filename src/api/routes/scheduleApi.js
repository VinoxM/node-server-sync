import apiBodyConst from '#constants/apiBodyConst.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank } from '#utils/preCheckUtil.js';
import { defineRoutes } from '#utils/defineUtil.js';
import { cancelJob, emitJob, startSchedule } from '#jobs/scheduleDispatcher.js';

const { POST } = apiMethodConst;
const { JOB_NAME } = apiBodyConst;

const needSecret = () => "mAou5820.schedule";

export default defineRoutes({
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
            return emitJob(jobName);
        }
    }
});