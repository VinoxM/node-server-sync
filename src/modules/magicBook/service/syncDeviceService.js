import syncDeviceRep from '../repository/syncDeviceRep.js';
import { deleteToken } from '#modules/authorization/authorizationService.js';

/**
 * 设备注册与会话更新服务
 * @param {number} uid - 用户 ID
 * @param {{ device_id: string, device_name: string, platform: string }} param1
 * @param {string} [tokenHash] - 当前请求绑定的会话 Token Hash
 */
export const registerDevice = async (uid, { device_id, device_name, platform }, tokenHash) => {
    __isAnyBlank(device_id, device_name, platform) && __throwMessage('Missing device parameters.', -1, 400);

    // 若同一设备更新登记了新的 Token，清理该设备此前绑定的旧 Token
    if (__isNotBlank(tokenHash)) {
        const existing = await syncDeviceRep.selectDevice(uid, device_id);
        if (existing?.tokenHash && existing.tokenHash !== tokenHash) {
            await deleteToken(existing.tokenHash).catch(() => {});
        }
    }

    await syncDeviceRep.upsertDevice({
        uid,
        deviceId: device_id,
        deviceName: device_name,
        platform,
        tokenHash
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

/**
 * 移除指定设备授权并级联销毁对应 Token
 * @param {number} uid - 用户 ID
 * @param {string} deviceId - 设备标识
 */
export const removeDevice = async (uid, deviceId) => {
    __isBlank(deviceId) && __throwMessage('Device id is required.', -1, 400);

    const device = await syncDeviceRep.selectDevice(uid, deviceId);
    if (device) {
        if (__isNotBlank(device.tokenHash)) {
            await deleteToken(device.tokenHash).catch(err => {
                __log.warn(`[Device] Failed to delete token for device ${deviceId}:`, err.message);
            });
        }
        await syncDeviceRep.deleteDevice(uid, deviceId);
    }

    return { success: true };
};
