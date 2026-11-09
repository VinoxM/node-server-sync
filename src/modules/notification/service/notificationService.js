import notificationRep from '../repository/notificationRep.js';

/**
 * 存储/发布一条频道通知消息
 * @param {Object} data - 通知消息载荷
 * @param {string} [data.channel] - 频道名称
 * @param {string} [data.event] - 事件名称
 * @param {string} [data.title] - 消息标题
 * @param {string} [data.message] - 消息文本
 * @param {string|object} [data.extra] - 附加信息
 * @param {string} [data.createBy] - 发送者
 * @returns {Promise<{ lastId: number, createTime: Date }>}
 * @throws {{ msg: string }} 当通知内容均为空时拒绝
 */
export async function storeNotification(data) {
    if (!data || typeof data !== 'object') {
        return Promise.reject({ msg: 'Invalid notification data.' });
    }
    const { message, event, title, extra } = data;
    const hasMessage = typeof message === 'string' && message.trim().length > 0;
    const hasEvent = typeof event === 'string' && event.trim().length > 0;
    const hasTitle = typeof title === 'string' && title.trim().length > 0;
    const hasExtra = extra !== undefined && extra !== null;

    if (!hasMessage && !hasEvent && !hasTitle && !hasExtra) {
        return Promise.reject({ msg: 'Invalid notification data: at least one of message, event, title, or extra must be provided.' });
    }
    return notificationRep.insertNotification(data);
}

/**
 * 获取指定频道的增量通知消息列表
 * @param {string} [channel] - 频道名称
 * @param {number} lastId - 上次拉取到的最大 ID 游标
 * @param {number} [limit=-1] - 查询条数上限
 * @param {string} [event] - 可选的事件过滤
 * @returns {Promise<Array<{ id: number, channel: string, event: string, title: string, message: string, extra: string, createBy: string, createTime: string }>>} 通知记录列表
 */
export async function getNotification(channel, lastId, limit, event) {
    return notificationRep.selectNotification({ channel, lastId, event }, limit).then(res => res.data);
}