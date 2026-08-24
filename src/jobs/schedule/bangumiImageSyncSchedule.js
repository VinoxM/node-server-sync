
import { pushImageToStorageSchedule } from "../../modules/anime/service/bangumi/bangumiImagesService.js";

export default {
    scheduleKey: "bangumiImagesSync",
    jobName: "Bangumi Images Sync",
    defaultCorn: "0 0 0/3 * * *",
    jobCallback: () => pushImageToStorageSchedule()
}