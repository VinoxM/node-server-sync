import syncProfileRep from '../repository/syncProfileRep.js';
import syncChangelogRep from '../repository/syncChangelogRep.js';
import { SYNC_ENTITY_TYPE } from '../constants/magicBookConst.js';

const dbName = 'magic_book';

/**
 * 获取当前用户的档案列表（仅未删除状态）
 * @param {number} uid - 用户 ID
 */
export const listProfiles = async (uid) => {
    const res = await syncProfileRep.selectProfilesByUid(uid, false);
    return res.data.map(p => ({
        profile_id: p.profileId,
        label: p.label,
        is_default: Boolean(p.isDefault),
        version: p.version,
        update_time: p.updateTime
    }));
};

/**
 * 创建新档案（同时写入变更流水）
 * @param {number} uid - 用户 ID
 * @param {{ profile_id: string, label: string, is_default?: boolean, device_id?: string }} param1
 */
export const createProfile = async (uid, { profile_id, label, is_default = false, device_id = 'server' }) => {
    __isAnyBlank(profile_id, label) && __throwMessage('Missing profile parameters.', -1, 400);

    return __sqliteDB.getTransactionDB(async (tx) => {
        await syncProfileRep.insertProfile({
            uid,
            profileId: profile_id,
            label,
            isDefault: is_default ? 1 : 0
        }, tx);

        const changelogRes = await syncChangelogRep.insertChangelog({
            uid,
            deviceId: device_id || 'server',
            entityType: SYNC_ENTITY_TYPE.PROFILE,
            profileId: profile_id,
            name: null,
            value: JSON.stringify({ label, is_default: Boolean(is_default) }),
            isDeleted: 0,
            clientTimestamp: Date.now()
        }, tx);

        return {
            success: true,
            cursor: changelogRes.lastId
        };
    }, null, dbName);
};

/**
 * 重命名档案（更新元数据并写入变更流水）
 * @param {number} uid - 用户 ID
 * @param {{ profile_id: string, label: string, device_id?: string }} param1
 */
export const renameProfile = async (uid, { profile_id, label, device_id = 'server' }) => {
    __isAnyBlank(profile_id, label) && __throwMessage('Missing profile parameters.', -1, 400);

    return __sqliteDB.getTransactionDB(async (tx) => {
        const existing = await syncProfileRep.selectProfile(uid, profile_id, tx);
        if (!existing || existing.isDeleted) {
            __throwMessage('Profile not found.', -1, 404);
        }

        await syncProfileRep.updateProfileLabel(uid, profile_id, label, tx);

        const changelogRes = await syncChangelogRep.insertChangelog({
            uid,
            deviceId: device_id || 'server',
            entityType: SYNC_ENTITY_TYPE.PROFILE,
            profileId: profile_id,
            name: null,
            value: JSON.stringify({ label }),
            isDeleted: 0,
            clientTimestamp: Date.now()
        }, tx);

        return {
            success: true,
            cursor: changelogRes.lastId
        };
    }, null, dbName);
};

/**
 * 软删除档案（标记软删除并写入墓碑变更流水）
 * @param {number} uid - 用户 ID
 * @param {{ profile_id: string, device_id?: string }} param1
 */
export const deleteProfile = async (uid, { profile_id, device_id = 'server' }) => {
    __isBlank(profile_id) && __throwMessage('Profile id is required.', -1, 400);

    return __sqliteDB.getTransactionDB(async (tx) => {
        const existing = await syncProfileRep.selectProfile(uid, profile_id, tx);
        if (!existing || existing.isDeleted) {
            __throwMessage('Profile not found.', -1, 404);
        }

        await syncProfileRep.softDeleteProfile(uid, profile_id, tx);

        const changelogRes = await syncChangelogRep.insertChangelog({
            uid,
            deviceId: device_id || 'server',
            entityType: SYNC_ENTITY_TYPE.PROFILE,
            profileId: profile_id,
            name: null,
            value: null,
            isDeleted: 1,
            clientTimestamp: Date.now()
        }, tx);

        return {
            success: true,
            cursor: changelogRes.lastId
        };
    }, null, dbName);
};

