import syncChangelogRep from '../repository/syncChangelogRep.js';
import syncDocumentRep from '../repository/syncDocumentRep.js';
import syncDeviceRep from '../repository/syncDeviceRep.js';
import syncProfileRep from '../repository/syncProfileRep.js';
import { SYNC_ENTITY_TYPE, SYNC_PULL_LIMIT } from '../constants/magicBookConst.js';

const dbName = 'magic_book';

/**
 * 增量拉取变更列表 (支持泛型二维作用域模型与旧版向下兼容)
 * @param {number} uid - 用户 ID
 * @param {number} [cursor=0] - 客户端本地保存的最大游标
 * @param {number} [limit=100] - 单次最大条数
 */
export const pullChanges = async (uid, cursor = 0, limit = SYNC_PULL_LIMIT.DEFAULT) => {
    const validLimit = Math.min(Math.max(1, Number(limit) || SYNC_PULL_LIMIT.DEFAULT), SYNC_PULL_LIMIT.MAX);
    const validCursor = Math.max(0, Number(cursor) || 0);

    // 查询 validLimit + 1 条以判断是否有更多数据
    const queryRes = await syncChangelogRep.selectChangesAfterCursor(uid, validCursor, validLimit + 1);
    const rawList = queryRes.data || [];

    const hasMore = rawList.length > validLimit;
    const items = hasMore ? rawList.slice(0, validLimit) : rawList;
    const nextCursor = items.length > 0 ? items[items.length - 1].cursor : validCursor;

    const changes = items.map(item => {
        const scopeType = item.scopeType || null;
        const scopeId = item.scopeId || null;

        // 向下兼容衍生字段：提取纯净 profile_id
        let legacyProfileId = '';
        if (scopeType === 'profile' && scopeId) {
            legacyProfileId = scopeId.includes(':') ? scopeId.split(':').slice(1).join(':') : scopeId;
        } else if (scopeType === 'user') {
            legacyProfileId = '';
        } else {
            legacyProfileId = scopeId || '';
        }

        return {
            cursor: item.cursor,
            entity_type: item.entityType,
            scope_type: scopeType,
            scope_id: scopeId,
            name: item.name,
            value: item.value,
            is_deleted: Number(item.isDeleted),
            client_timestamp: Number(item.clientTimestamp),
            // 向下兼容旧客户端字段
            scope: scopeType,
            profile_id: legacyProfileId
        };
    });

    return {
        has_more: hasMore,
        next_cursor: nextCursor,
        changes
    };
};

/**
 * 提交增量变更集合（事务执行快照更新与流水追加，自动兼容泛型与旧版格式）
 * @param {number} uid - 用户 ID
 * @param {string} deviceId - 设备标识
 * @param {Array<object>} changes - 变更集合
 */
export const pushChanges = async (uid, deviceId, changes = []) => {
    __isBlank(deviceId) && __throwMessage('Device id is required.', -1, 400);

    // 校验设备合法性：若设备不存在或已被吊销，阻断写入
    const device = await syncDeviceRep.selectDevice(uid, deviceId);
    if (!device) {
        __throwMessage('Device authorization has been revoked.', -401, 401);
    }

    if (!Array.isArray(changes) || changes.length === 0) {
        const currentCursor = await syncChangelogRep.selectLatestCursor(uid);
        return {
            success: true,
            latest_cursor: currentCursor
        };
    }

    return __sqliteDB.getTransactionDB(async (tx) => {
        for (const change of changes) {
            const entityType = change.entity_type || change.entityType || SYNC_ENTITY_TYPE.DOCUMENT;
            const isDeleted = change.is_deleted ? 1 : 0;
            const clientTimestamp = Number(change.client_timestamp || change.clientTimestamp) || Date.now();
            const name = change.name || null;
            const rawValue = change.value;
            const valueStr = typeof rawValue === 'object' && rawValue !== null ? JSON.stringify(rawValue) : (rawValue ?? null);

            // 统一解析与归一化 scopeType 和 scopeId（向下兼容旧客户端）
            let scopeType = change.scope_type || change.scopeType || change.scope || 'profile';
            let scopeId = change.scope_id ?? change.scopeId;
            if (scopeId === undefined || scopeId === null) {
                if (scopeType === 'user') {
                    scopeId = String(uid);
                } else if (scopeType === 'global') {
                    scopeId = 'global';
                } else {
                    const pid = change.profile_id || change.profileId || '';
                    scopeId = pid ? `${uid}:${pid}` : '';
                }
            }

            if (entityType === SYNC_ENTITY_TYPE.DOCUMENT) {
                if (__isBlank(name)) {
                    continue;
                }
                // 1. 更新文档最新快照 (按泛型主键 UPSERT)
                await syncDocumentRep.upsertDocument({
                    uid,
                    scopeType,
                    scopeId: String(scopeId),
                    name,
                    value: valueStr ?? '',
                    lastDeviceId: deviceId,
                    isDeleted
                }, tx);

                // 2. 追加变更流水 (泛型)
                await syncChangelogRep.insertChangelog({
                    uid,
                    deviceId,
                    entityType: SYNC_ENTITY_TYPE.DOCUMENT,
                    scopeType,
                    scopeId: String(scopeId),
                    name,
                    value: valueStr,
                    isDeleted,
                    clientTimestamp
                }, tx);
            } else if (entityType === SYNC_ENTITY_TYPE.PROFILE) {
                const pureProfileId = change.profile_id || change.profileId || (String(scopeId).includes(':') ? String(scopeId).split(':').slice(1).join(':') : String(scopeId)) || '';
                if (__isBlank(pureProfileId)) {
                    continue;
                }
                // 1. 更新 Profile 状态
                if (isDeleted) {
                    await syncProfileRep.softDeleteProfile(uid, pureProfileId, tx);
                } else {
                    let parsedData = {};
                    try {
                        parsedData = typeof rawValue === 'string' ? JSON.parse(rawValue) : (rawValue || {});
                    } catch (ignored) { }

                    await syncProfileRep.insertProfile({
                        uid,
                        profileId: pureProfileId,
                        label: parsedData.label || change.label || '',
                        isDefault: parsedData.is_default || change.is_default ? 1 : 0
                    }, tx);
                }

                // 2. 追加流水
                await syncChangelogRep.insertChangelog({
                    uid,
                    deviceId,
                    entityType: SYNC_ENTITY_TYPE.PROFILE,
                    scopeType: 'profile',
                    scopeId: `${uid}:${pureProfileId}`,
                    name: null,
                    value: valueStr,
                    isDeleted,
                    clientTimestamp
                }, tx);
            }
        }

        // 3. 刷新设备最后活跃时间
        await syncDeviceRep.updateActiveTime(uid, deviceId, null, tx);

        // 4. 获取最新的全局游标
        const latestCursor = await syncChangelogRep.selectLatestCursor(uid, tx);

        return {
            success: true,
            latest_cursor: latestCursor
        };
    }, null, dbName);
};

/**
 * 获取全量基准快照数据 (支持按泛型 scopeType, scopeId 或传统 profileId 筛选)
 * @param {number} uid - 用户 ID
 * @param {string|object} [profileIdOrOptions] - 可选档案过滤标识或参数选项对象
 */
export const getBaselineSnapshot = async (uid, profileIdOrOptions) => {
    const filter = typeof profileIdOrOptions === 'string' ? { profileId: profileIdOrOptions } : (profileIdOrOptions || {});
    let targetScopeId = filter.scopeId || filter.scope_id;
    if (!targetScopeId && filter.profileId) {
        targetScopeId = `${uid}:${filter.profileId}`;
    }

    const docRes = await syncDocumentRep.selectDocuments(uid, {
        scopeType: filter.scopeType || filter.scope_type,
        scopeId: targetScopeId,
        profileId: filter.profileId,
        includeDeleted: false
    });

    const serverCursor = await syncChangelogRep.selectLatestCursor(uid);

    const documents = docRes.data.map(doc => {
        const scopeType = doc.scopeType;
        const scopeId = doc.scopeId;

        let legacyProfileId = '';
        if (scopeType === 'profile' && scopeId) {
            legacyProfileId = scopeId.includes(':') ? scopeId.split(':').slice(1).join(':') : scopeId;
        } else if (scopeType === 'user') {
            legacyProfileId = '';
        } else {
            legacyProfileId = scopeId || '';
        }

        return {
            scope_type: scopeType,
            scope_id: scopeId,
            name: doc.name,
            value: doc.value,
            version: doc.version,
            last_device_id: doc.lastDeviceId,
            update_time: doc.updateTime,
            // 向下兼容旧客户端字段
            scope: scopeType,
            profile_id: legacyProfileId
        };
    });

    return {
        server_cursor: serverCursor,
        documents
    };
};

/**
 * 历史增量流水日志归档修剪任务
 * @param {number} [retentionDays=30] - 保留天数
 */
export const cleanExpiredChangelog = async (retentionDays = 30) => {
    const expireDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const res = await syncChangelogRep.deleteChangelogBefore(expireDate);
    return { cleanedRows: res.rows };
};
