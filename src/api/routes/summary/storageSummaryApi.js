import { getLatestStorageSummary, storageSummaryDimensions } from "../../../modules/statistics/service/storageSummaryService.js";
import apiMethodConst from "../../../common/constants/apiMethodConst.js";
import { getMinioClientMatchersSafely } from "../../../modules/media/service/mediaMinioService.js";
import { allowLanHosts } from "../../../common/constants/allowHostsConst.js";

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
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        needSecret,
        callback: async () => {
            const summary = await getLatestStorageSummary()
            if (summary === null) return summary;
            const dimensions = summary.dimensions || {}
            const { bucketUsage } = dimensions
            const minioDefaultClientLabel = __env.get('minio.defaultLabel', 'default')
            const minioClientMatchers = getMinioClientMatchersSafely()
            if (minioClientMatchers !== null) {
                const minioClient = new Map()
                Object.keys(bucketUsage).forEach(bucket => {
                    const label = Object.keys(minioClientMatchers).find(label => {
                        const matcher = minioClientMatchers[label]?.matcher
                        return matcher && new RegExp(matcher).test(`/${bucket}/`)
                    }) ?? minioDefaultClientLabel
                    const minioBuckets = minioClient.get(label) ?? []
                    minioBuckets.push(bucket)
                    minioClient.set(label, minioBuckets)
                })
                dimensions.minioClient = Object.fromEntries(minioClient.entries())
            }
            return summary;
        }
    }
}
