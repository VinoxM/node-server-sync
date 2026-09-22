/**
 * RSS 订阅同步状态枚举
 * @readonly
 * @enum {number}
 */
export const RSS_SUBSCRIBE_VECTOR_STATUS = {
    /** 数据准备中 */
    PREPARED: -1,
    /** 准备就绪 */
    READY: 0,
    /** 同步中/处理中 */
    PENDING: 1,
    /** 同步完成 */
    COMPLETE: 2
};