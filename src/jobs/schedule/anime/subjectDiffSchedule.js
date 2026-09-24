import { updateNotFinSubjects } from "#modules/anime/service/bangumi/bangumiDiffService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

export default defineScheduleJob({
    scheduleKey: "subjectDiff",
    jobName: "Bangumi Subject Diff",
    defaultCron: "0 20 4 * * *",
    jobCallback: () => updateNotFinSubjects()
});