import syncDeviceRep from '../repository/syncDeviceRep.js';

/**
 * 设备注册与会话更新服务
 * @param {number} uid - 用户 ID
 * @param {{ device_id: string, device_name: string, platform: string }} param1
 */
export const registerDevice = async (uid, { device_id, device_name, platform }) => {
    __isAnyBlank(device_id, device_name, platform) && __throwMessage('Missing device parameters.', -1, 400);
    await syncDeviceRep.upsertDevice({
        uid,
        deviceId: device_id,
        deviceName: device_name,
        platform
    });
    return { success: true };
};

/**
 * 获取当前用户的所有登记设备列表
 * @param {number} uid - 用户 ID
 */
export const getDeviceList = async (uid) => {
    const res = await syncDeviceRep.selectDevicesByUid(uid);
    return res.data || [];
};

