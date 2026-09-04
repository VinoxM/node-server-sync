import { defineRoutes } from '#utils/defineUtil.js';
import { getLatestStorageSummary, storageSummaryDimensions } from "#modules/statistics/service/storageSummaryService.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { getMinioClientMatchersSafely } from "#modules/media/service/mediaMinioService.js";
import { allowLanHosts } from "#constants/allowHostsConst.js";
import { NEED_AUTH_CLIENT } from '#common/constants/authorizationConst.js';

const { POST, GET } = apiMethodConst;

/** 获取存储容量统计模块通信秘钥 */
const needSecret = () => "mAou5820.summary";

/**
 * 存储容量监控与维度快照路由模块 (`/summary/*`)
 */
export default defineRoutes({
    basePath: "/summary",

    /**
     * 手动触发全库存储用量汇总统计定时任务
     */
    "/storage/doSummary": {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        needAuth: { clients: [NEED_AUTH_CLIENT.MANAGE] },
        callback: () => storageSummaryDimensions()
    },

    /**
     * 查询最新一条存储快照并按 MinIO 客户端标签聚类维度
     * 仅允许白名单局域网/内网 Host 访问
     */
    '/storage/getLatestDimensions': {
        method: GET,
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        needSecret,
        callback: async () => {
            const summary = await getLatestStorageSummary();
            if (summary === null) return summary;
            const dimensions = summary.dimensions || {};
            const { bucketUsage } = dimensions;
            const minioDefaultClientLabel = __env.get('minio.defaultLabel', 'default');
            const minioClientMatchers = getMinioClientMatchersSafely();
            if (minioClientMatchers !== null && bucketUsage) {
                const minioClient = new Map();
                Object.keys(bucketUsage).forEach(bucket => {
                    const label = Object.keys(minioClientMatchers).find(label => {
                        const matcher = minioClientMatchers[label]?.matcher;
                        return matcher && new RegExp(matcher).test(`/${bucket}/`);
                    }) ?? minioDefaultClientLabel;
                    const minioBuckets = minioClient.get(label) ?? [];
                    minioBuckets.push(bucket);
                    minioClient.set(label, minioBuckets);
                });
                dimensions.minioClient = Object.fromEntries(minioClient.entries());
            }
            return summary;
        }
    }
});
