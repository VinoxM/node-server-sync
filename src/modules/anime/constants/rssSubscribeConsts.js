/**
 * RSS 订阅同步状态枚举
 * @readonly
 * @enum {number}
 */
export const RSS_SUBSCRIBE_SYNC_STATUS = {
    /** 准备就绪 */
    READY: -1,
    /** 同步中/处理中 */
    PENDING: 0,
    /** 同步完成 */
    COMPLETE: 1
};