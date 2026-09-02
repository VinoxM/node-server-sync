/**
 * 媒体视频处理主状态字典
 */
export const MEDIA_VIDEO_STATUS = {
    /** 解析中 (0) */
    ANALYZING: 0,
    /** 已准备就绪/等待处理 (1) */
    PREPARED: 1,
    /** 上传中 (2) */
    UPLOADING: 2,
    /** 处理完成 (3) */
    COMPLETE: 3,
    /** 已删除/已移除 (4) */
    REMOVED: 4
};

/**
 * 媒体 MinIO 对象存储任务状态字典
 */
export const MEDIA_MINIO_STATUS = {
    /** 已删除 (-1) */
    REMOVED: -1,
    /** 准备中 (0) */
    PREPARED: 0,
    /** 下载中 (1) */
    DOWNLOADING: 1,
    /** 上传中 (2) */
    UPLOADING: 2,
    /** 完成 (3) */
    COMPLETE: 3,
    /** 失败 (4) */
    FAILED: 4
};

/**
 * 媒体 Aria2 下载任务状态字典
 */
export const MEDIA_ARIA2_TASK_STATUS = {
    /** 已移除 (-1) */
    REMOVED: -1,
    /** 准备中 (0) */
    PREPARED: 0,
    /** 下载中 (1) */
    DOWNLOADING: 1,
    /** 完成 (2) */
    COMPLETE: 2,
    /** 失败 (3) */
    FAILED: 3
};

/**
 * 媒体过滤规则类型字典
 */
export const MEDIA_FILTER_TYPE = {
    /** 按创作者/UP主过滤 (1) */
    AUTHOR: 1,
    /** 按视频唯一标识过滤 (2) */
    UNIQUE_ID: 2
};

/**
 * 媒体 MinIO 关联资源类型字典
 */
export const MEDIA_VIDEO_MINIO_TYPE = {
    /** 封面图片 (1) */
    COVER: 1,
    /** 视频源文件 (2) */
    SOURCE: 2,
    /** 弹幕数据 (3) */
    BARRAGE: 3
};

/**
 * 媒体资源类型描述映射表
 */
export const MEDIA_TYPE_DESCRIPTION = {
    [MEDIA_VIDEO_MINIO_TYPE.SOURCE]: "source",
    [MEDIA_VIDEO_MINIO_TYPE.COVER]: "cover",
    [MEDIA_VIDEO_MINIO_TYPE.BARRAGE]: "barrage"
};

/**
 * 媒体主要/核心资源类型列表 (默认主资源为封面图)
 * @type {number[]}
 */
export const MEDIA_MINIO_TYPE_MAIN = [
    MEDIA_VIDEO_MINIO_TYPE.COVER
];

/**
 * 媒体分类归属类型字典
 */
export const MEDIA_CATEGORY_TYPE = {
    /** 普通公共分类 (0) */
    NORMAL: 0,
    /** 内部私密分类 (1) */
    INSIDE: 1
};

/**
 * B站直播录制全量事件名数组
 * @type {string[]}
 */
export const MEDIA_BILIVE_RECORD_EVENT_ARRAY = [
    'SessionStarted',
    'FileOpening',
    'FileClosed',
    'SessionEnded',
    'StreamStarted',
    'StreamEnded'
];

/**
 * B站直播录制事件枚举值字典
 */
export const MEDIA_BILIVE_RECORD_EVENT_TYPE = {
    SessionStarted: 0,
    FileOpening: 1,
    FileClosed: 2,
    SessionEnded: 3,
    StreamStarted: 4,
    StreamEnded: 5
};

/**
 * B站直播流启停事件
 */
export const MEDIA_BILIVE_STREAM_EVENT = {
    StreamStarted: 4,
    StreamEnded: 5
};

/**
 * B站直播会话启停事件
 */
export const MEDIA_BILIVE_SESSION_EVENT = {
    SessionStarted: 0,
    SessionEnded: 3
};

/**
 * B站录制文件生命周期事件
 */
export const MEDIA_BILIVE_FILE_EVENT = {
    FileOpening: 1,
    FileClosed: 2
};

/**
 * B站直播间推流状态字典
 */
export const MEDIA_BILIVE_STREAM_STATUS = {
    /** 自动异步轮询 (-1) */
    AUTO_ASYNC: -1,
    /** 未开播/已关播 (0) */
    NOT_LIVE: 0,
    /** 正在直播中 (1) */
    STREAMING: 1,
    /** 准备下播 (2) */
    READY_TO_ENDED: 2
};

/**
 * B站录制切片文件状态字典
 */
export const MEDIA_BILIVE_RECORD_FILE_STATUS = {
    /** 已删除 (-1) */
    REMOVED: -1,
    /** 正在录制/文件打开中 (0) */
    OPENING: 0,
    /** 录制完成/文件已关闭 (1) */
    CLOSED: 1
};

/**
 * B站录制文件 MinIO 上传同步状态字典
 */
export const MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS = {
    /** 未同步 (0) */
    NOT_SYNCHRONIZED: 0,
    /** 正在同步上传中 (1) */
    SYNCHRONIZING: 1,
    /** 已同步完成 (2) */
    SYNCHRONIZED: 2
};