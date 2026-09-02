import notificationRep from '../repository/notificationRep.js';

/**
 * 存储/发布一条频道通知消息
 * @param {Object} data - 通知消息载荷
 * @param {string} [data.channel] - 频道名称
 * @param {string} data.message - 消息文本
 * @param {string} [data.extra] - 附加信息
 * @param {string} [data.createBy] - 发送者
 * @returns {Promise<{ lastId: number, createTime: Date }>}
 * @throws {{ msg: string }} 当消息内容为空时拒绝
 */
export async function storeNotification(data) {
    const { message } = data;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return Promise.reject({ msg: 'Invalid message.' });
    }
    return notificationRep.insertNotification(data);
}

/**
 * 获取指定频道的增量通知消息列表
 * @param {string} [channel] - 频道名称
 * @param {number} lastId - 上次拉取到的最大 ID 游标
 * @param {number} [limit=-1] - 查询条数上限
 * @returns {Promise<Array<{ id: number, message: string, extra: string, createBy: string, createTime: string }>>} 通知记录列表
 */
export async function getNotification(channel, lastId, limit) {
    return notificationRep.selectNotification({ channel, lastId }, limit).then(res => res.data);
}