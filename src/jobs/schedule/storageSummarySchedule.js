import { storageSummaryDimensions } from "../../modules/statistics/service/storageSummaryService.js";

export default {
    scheduleKey: "storageSummary",
    jobName: "Storage Summary",
    defaultCorn: "0 0 6 * * *",
    jobCallback: () => storageSummaryDimensions()
}