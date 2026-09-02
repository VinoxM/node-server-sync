/**
 * RSS 字幕资源解析与上传状态枚举
 * @readonly
 * @enum {number}
 */
export const RSS_SUBTITLE_STATUS = {
    /** 已移除 */
    REMOVED: -1,
    /** 已就绪/待提取 */
    PREPARED: 0,
    /** 上传中 */
    UPLOADING: 1,
    /** 上传完成 */
    COMPLETE: 2,
    /** 提取或上传失败 */
    FAILED: 3,
};

/**
 * RSS 字幕文件物理存在状态枚举
 * @readonly
 * @enum {number}
 */
export const RSS_SUBTITLE_FILE_STATUS = {
    /** 物理文件存在 */
    EXISTS: 1,
    /** 物理文件已清理/移除 */
    REMOVED: 0
};