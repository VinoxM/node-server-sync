/**
 * 种子下载/转码流水线任务状态枚举
 * @readonly
 * @enum {string}
 */
export const TASK_STATUS = {
    /** 任务失败 */
    FAILED: '0',
    /** 下载中 */
    DOWNLOADING: '1',
    /** 资源解析中 (提取字幕/字体/转码等) */
    RESOLVING: '2',
    /** 资源解析失败 */
    RESOLVE_FAILED: '3',
    /** 上传对象存储中 */
    UPLOADING: '4',
    /** 全部完成 */
    COMPLETE: '5',
    /** 部分完成 (部分集数成功) */
    PARTIALLY_COMPLETE: '6',
};

/**
 * 单话剧集处理状态枚举
 * @readonly
 * @enum {string}
 */
export const EPISODE_STATUS = {
    /** 待处理 */
    PREPARED: '0',
    /** 处理完成并就绪 */
    COMPLETE: '1',
    /** 处理失败 */
    FAILED: '2'
};

/**
 * 剧集解析失败原因枚举
 * @readonly
 * @enum {string}
 */
export const EPISODE_FAILED_REASON = {
    /** 提取内嵌字体失败 */
    EXTRACT_FONTS_FAILED: '-3',
    /** 提取字幕失败 */
    EXTRACT_SUBTITLE_FAILED: '-2',
    /** MKV 转封装 MP4 失败 */
    CONVERT_MKV_TO_MP4_FAILED: '-1',
    /** 未知错误 */
    UNKNOWN: '0',
    /** 通用解析失败 */
    RESOLVE_FAILED: '1',
    /** 剧集已存在重复跳过 */
    EPISODE_EXISTS: '2',
    /** 成功 (用于标记已修复) */
    SUCCESS: '3'
};