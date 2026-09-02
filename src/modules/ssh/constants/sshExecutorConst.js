/**
 * @typedef {import('#types/sshTypes.d.ts').SshScriptDefinition} SshScriptDefinition
 */

/**
 * 远程 SSH Shell 脚本静态元数据定义映射表
 * @type {Record<string, SshScriptDefinition>}
 */
export default {
    BATCH_DELETE_FOLDER: {
        title: 'Remove Remote Empty Folder',
        descGenerator: (...folders) => `Remove remote empty folders: ${folders.join(', ')}`
    },
    BATCH_DELETE_FILE: {
        title: 'Remove Remote File',
        descGenerator: (...files) => `Remove remote files: ${files.join(', ')}`
    },
    FFMPEG_CONVERT_FLV_TO_MP4: {
        title: 'Convert File Flv To Mp4',
        descGenerator: (flvFilePath, mp4FilePath) => `Convert file flv to mp4: ${flvFilePath} -> ${mp4FilePath}`
    },
    FFMPEG_CONVERT_MKV_TO_MP4: {
        title: 'Convert File Mkv To Mp4',
        descGenerator: (mkvFilePath, mp4FilePath) => `Convert file mkv to mp4: ${mkvFilePath} -> ${mp4FilePath}`
    },
    FFMPEG_EXTRACT_MKV_FONTS: {
        title: `Extract mkv file's fonts and rename`,
        descGenerator: (filePath) => `Extract mkv file's fonts: ${filePath}`
    },
    FFMPEG_EXTRACT_MKV_SUBTITLES: {
        title: `Extract mkv file's subtitles`,
        descGenerator: (filePath) => `Extract mkv file's subtitles: ${filePath} -> ${filePath}.subtitle`
    },
    MINIO_COPY_SCRIPT: {
        title: 'Copy File To Minio',
        descGenerator: (sourceFile, minioLink) => `Copy file to minio, ${sourceFile} ==> ${minioLink}`
    },
    MINIO_DOWNLOAD_SCRIPT: {
        title: 'Download File To Minio',
        descGenerator: (sourceUrl, minioLink) => `Download file to minio, ${sourceUrl} ==> ${minioLink}`
    },
    MINIO_DOWNLOAD_SCRIPT_WITH_PROXY: {
        title: 'Download File To Minio With Proxy',
        descGenerator: (sourceUrl, minioLink) => `Download file to minio, ${sourceUrl} ==> ${minioLink}`
    },
    MINIO_MOVE_SCRIPT: {
        title: 'Move File To Minio',
        descGenerator: (sourceFile, minioLink) => `Move file to minio, ${sourceFile} ==> ${minioLink}`
    }
};