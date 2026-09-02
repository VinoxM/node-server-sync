import { MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_STREAM_STATUS } from "../../constants/mediaConst.js";

const dbName = 'media';
const enablePrint = { print: true };

const STREAM_FULL_COLUMNS = [
    "id",
    "room_id",
    "host_name",
    "title",
    "area_name_parent",
    "area_name_child",
    "start_time",
    "end_time",
    "streaming",
    "end_reason",
    "end_by_record_id",
    "video_id"
];

/**
 * B站直播推流与录制流元数据访问仓库
 */
export default {
    /**
     * 根据主键 ID 查询推流记录
     * @param {number} id - 直播流 ID
     * @returns {Promise<{ id: number, roomId: string|number, hostName: string, title: string, areaNameParent: string, areaNameChild: string, startTime: string, endTime: string, streaming: number, endReason: string, endByRecordId: number, videoId: number }|null>}
     */
    selectOneById: id => {
        const sql = `SELECT ${STREAM_FULL_COLUMNS.join(',')} `
            + `FROM bilive_record_stream WHERE id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 根据直播流 ID 查询已生成的视频记录及推流状态
     * @param {number} streamId - 直播流 ID
     * @returns {Promise<{ videoId: number, streaming: number, status: number }|null>}
     */
    selectExistsVideoByStreamId: streamId => {
        const sql = `SELECT brs.video_id, brs.streaming, v.status FROM bilive_record_stream brs INNER JOIN videos v ON v.id=brs.video_id WHERE brs.id = ?`;
        return __sqliteDB.selectOne(sql, [streamId], null, dbName);
    },

    /**
     * 插入一条新的开播推流记录
     * @param {string|number} roomId - 直播间 ID
     * @param {string} hostName - 主播名称
     * @param {string} title - 直播间标题
     * @param {string} areaNameParent - 主分区名
     * @param {string} areaNameChild - 子分区名
     * @param {any} startTime - 开播时间
     * @param {any} [endTime] - 关播时间
     * @returns {Promise<ExecResult>}
     */
    insertStartStream: (roomId, hostName, title, areaNameParent, areaNameChild, startTime, endTime) => {
        const sql = `INSERT INTO bilive_record_stream (room_id, host_name, title, area_name_parent, area_name_child, start_time, end_time) VALUES(?,?,?,?,?,?,?)`;
        const params = [roomId, hostName, title, areaNameParent, areaNameChild, startTime, endTime];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 根据直播间 ID 查询最新的一条推流记录
     * @param {string|number} roomId - 直播间 ID
     * @returns {Promise<{ id: number, startTime: string }|null>}
     */
    selectLatestStreamByRoomId: (roomId) => {
        const sql = `SELECT id, start_time FROM bilive_record_stream WHERE room_id=? ORDER BY id DESC LIMIT 1`;
        return __sqliteDB.selectOne(sql, [roomId], null, dbName);
    },

    /**
     * 根据直播间 ID 查询当前正在直播或准备关播的推流记录
     * @param {string|number} roomId - 直播间 ID
     * @returns {Promise<{ id: number, startTime: string, streaming: number }|null>}
     */
    selectLatestStreamingByRoomId: (roomId) => {
        const sql = `SELECT id, start_time, streaming FROM bilive_record_stream WHERE room_id=? AND streaming IN (${MEDIA_BILIVE_STREAM_STATUS.STREAMING}, ${MEDIA_BILIVE_STREAM_STATUS.READY_TO_ENDED}) ORDER BY id DESC LIMIT 1`;
        return __sqliteDB.selectOne(sql, [roomId], null, dbName);
    },

    /**
     * 回填关联生成的视频主键 ID
     * @param {number} videoId - videos 主键 ID
     * @param {number} id - 直播流 ID
     * @returns {Promise<ExecResult>}
     */
    updateVideoIdById: (videoId, id) => {
        const sql = `UPDATE bilive_record_stream SET video_id=? WHERE id=?`;
        return __sqliteDB.update(sql, [videoId, id], null, dbName);
    },

    /**
     * 将推流状态置为准备关播 (READY_TO_ENDED)
     * @param {number} id - 直播流 ID
     * @param {any} endTime - 关播时间
     * @param {number} recordId - 关联的 bilive_record 主键 ID
     * @param {string} reason - 关播原因
     * @returns {Promise<ExecResult>}
     */
    updateStreamReadyToEndedById: (id, endTime, recordId, reason) => {
        const sql = `UPDATE bilive_record_stream SET streaming=${MEDIA_BILIVE_STREAM_STATUS.READY_TO_ENDED},end_time=?,end_by_record_id=?,end_reason=? WHERE id=? AND streaming=?`;
        return __sqliteDB.update(sql, [endTime, recordId, reason, id, MEDIA_BILIVE_STREAM_STATUS.STREAMING], null, dbName);
    },

    /**
     * 将推流状态正式置为已关播 (NOT_LIVE)
     * @param {number} id - 直播流 ID
     * @param {any} [endTime] - 关播时间
     * @param {number} [recordId] - 关联的事件 ID
     * @param {string} [reason] - 关播原因
     * @returns {Promise<ExecResult>}
     */
    updateStreamEndedById: (id, endTime, recordId, reason) => {
        const params = [];
        let sql = `UPDATE bilive_record_stream SET streaming=${MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE}`;
        if (endTime) {
            sql += `,end_time=?`;
            params.push(endTime);
        }
        if (recordId) {
            sql += `,end_by_record_id=?`;
            params.push(recordId);
        }
        if (reason) {
            sql += `,end_reason=?`;
            params.push(reason);
        }
        sql += ` WHERE id=?`;
        params.push(id);
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 根据直播间 ID 将推流状态置为已关播 (NOT_LIVE)
     * @param {string|number} roomId - 直播间 ID
     * @returns {Promise<ExecResult>}
     */
    updateStreamEndedByRoomId: (roomId) => {
        const sql = `UPDATE bilive_record_stream SET streaming=${MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE} WHERE room_id=?`;
        return __sqliteDB.update(sql, [roomId], null, dbName);
    },

    /**
     * 将处于 READY_TO_ENDED 状态的推流正式置为 NOT_LIVE
     * @param {number} id - 直播流 ID
     * @returns {Promise<ExecResult>}
     */
    updateReadyToEndStreamEndedById: (id) => {
        const sql = `UPDATE bilive_record_stream SET streaming=${MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE} WHERE id=? AND streaming=?`;
        return __sqliteDB.update(sql, [id, MEDIA_BILIVE_STREAM_STATUS.READY_TO_ENDED], null, dbName);
    },

    /**
     * 查询导致推流结束的事件原始载荷
     * @param {number} id - 直播流 ID
     * @returns {Promise<{ event: string, eventTimestamp: string, eventData: string }|null>}
     */
    selectEndedEventDataById: (id) => {
        const sql = `SELECT br.event,br.event_timestamp,br.event_data FROM bilive_record br WHERE br.id IN (SELECT brs.end_by_record_id FROM bilive_record_stream brs WHERE brs.id=?)`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 删除指定的推流记录
     * @param {number} id - 直播流 ID
     * @returns {Promise<ExecResult>}
     */
    deleteStreamById: id => {
        const sql = `DELETE FROM bilive_record_stream WHERE id=?`;
        return __sqliteDB.delete(sql, [id], null, dbName);
    },

    /**
     * 分页多条件检索直播流列表（包含切片文件统计）
     * @param {string|number} [roomId] - 直播间 ID
     * @param {string} [hostName] - 主播名称模糊搜索
     * @param {number} [pageSize] - 每页条数
     * @param {number} [pageNum] - 当前页码
     * @returns {Promise<QueryResult<{ id: number, roomId: string|number, hostName: string, title: string, areaNameParent: string, areaNameChild: string, startTime: string, endTime: string, streaming: number, endReason: string, endByRecordId: number, videoExists: number|null, recordExists: number, fileExists: number }>>}
     */
    selectStreamForSearch: (roomId, hostName, pageSize, pageNum) => {
        const params = [];
        let sql = `SELECT ${STREAM_FULL_COLUMNS.slice(0, STREAM_FULL_COLUMNS.length - 1).map(c => 'brs.' + c).join(',')}, `
            + `v.id AS videoExists, `
            + `COUNT(brf.id) AS recordExists, `
            + `SUM(CASE WHEN brf.file_status=${MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED} THEN 0 ELSE 1 END) AS fileExists `
            + `FROM bilive_record_stream brs `
            + `LEFT JOIN videos v ON v.id=brs.video_id `
            + `LEFT JOIN bilive_record_files brf on brf.stream_id=brs.id `;
        const concat = [];
        if (__isNotBlank(roomId)) {
            concat.push(`brs.room_id=? `);
            params.push(roomId);
        }
        if (__isNotBlank(hostName)) {
            concat.push(`brs.host_name like ? `);
            params.push(`%${hostName}%`);
        }
        if (concat.length > 0) {
            sql += `WHERE ` + concat.join('AND ');
        }
        sql += `GROUP BY brs.id ORDER BY brs.id DESC`;
        if (pageNum !== undefined && pageSize !== undefined) {
            const offset = (pageNum - 1) * pageSize;
            sql += ' LIMIT ? OFFSET ?';
            params.push(pageSize, offset);
        }
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 查询符合检索条件的直播流总数
     * @param {string|number} [roomId] - 直播间 ID
     * @param {string} [hostName] - 主播名称
     * @returns {Promise<number>}
     */
    selectStreamForSearchCount: async (roomId, hostName) => {
        const params = [];
        let sql = `SELECT COUNT(id) as total FROM bilive_record_stream `;
        const concat = [];
        if (__isNotBlank(roomId)) {
            concat.push(`room_id=? `);
            params.push(roomId);
        }
        if (__isNotBlank(hostName)) {
            concat.push(`host_name like ? `);
            params.push(`%${hostName}%`);
        }
        if (concat.length > 0) {
            sql += `WHERE ` + concat.join('AND ');
        }
        return __sqliteDB.selectOne(sql, params, null, dbName).then(res => res?.total || 0);
    },

    /**
     * 查询已关播且未生成视频、但存在可用录制切片文件的直播流列表（用于后台自动同步任务）
     * @returns {Promise<QueryResult<{ id: number }>>}
     */
    selectNotLiveStreamForAutoSync: () => {
        const sql = `SELECT t.id FROM (`
            + `SELECT brs.id, `
            + `v.id AS videoExists, `
            + `COUNT(brf.id) AS recordExists, `
            + `SUM(CASE WHEN brf.file_status=${MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED} THEN 0 ELSE 1 END) AS fileExists `
            + `FROM bilive_record_stream brs `
            + `LEFT JOIN videos v ON v.id=brs.video_id `
            + `LEFT JOIN bilive_record_files brf on brf.stream_id=brs.id `
            + `WHERE brs.streaming=${MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE} `
            + `GROUP BY brs.id ORDER BY brs.id `
            + `) AS t WHERE t.videoExists IS NULL AND t.recordExists > 0 AND t.fileExists > 0 `;
        return __sqliteDB.selectAll(sql, [], null, dbName);
    },

    /**
     * 将推流状态置为异步自动同步中 (AUTO_ASYNC)
     * @param {number} id - 直播流 ID
     * @returns {Promise<number>} 受影响行数
     */
    updateStreamToSync: (id) => {
        const sql = `UPDATE bilive_record_stream SET streaming=? WHERE id=? AND streaming=?`;
        return __sqliteDB.update(sql, [MEDIA_BILIVE_STREAM_STATUS.AUTO_ASYNC, id, MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE], null, dbName).then(res => res.rows);
    },

    /**
     * 确认直播流是否正处于 AUTO_ASYNC 同步状态中
     * @param {number} id - 直播流 ID
     * @returns {Promise<boolean>}
     */
    ensureSyncStream: id => {
        const sql = `SELECT EXISTS(SELECT 1 FROM bilive_record_stream WHERE id=? AND streaming=${MEDIA_BILIVE_STREAM_STATUS.AUTO_ASYNC}) AS result`;
        return __sqliteDB.selectOne(sql, [id], null, dbName).then(res => !!res?.result);
    },

    /**
     * 将处于 AUTO_ASYNC 的推流状态恢复为 NOT_LIVE
     * @param {number} id - 直播流 ID
     * @returns {Promise<ExecResult>}
     */
    updateStreamNotLiveFromSync: (id) => {
        const sql = `UPDATE bilive_record_stream SET streaming=? WHERE id=? AND streaming=?`;
        return __sqliteDB.update(sql, [MEDIA_BILIVE_STREAM_STATUS.NOT_LIVE, id, MEDIA_BILIVE_STREAM_STATUS.AUTO_ASYNC], null, dbName);
    },

    /**
     * 根据切片文件 ID 查询其所属的直播流及推流状态
     * @param {number} fileId - 文件 ID
     * @returns {Promise<{ id: number, streaming: number }|null>}
     */
    selectStreamByFileId: (fileId) => {
        const sql = `SELECT brs.id, brs.streaming FROM bilive_record_files bf INNER JOIN bilive_record_stream brs ON bf.stream_id=brs.id WHERE bf.id=?`;
        return __sqliteDB.selectOne(sql, [fileId], null, dbName);
    }
};