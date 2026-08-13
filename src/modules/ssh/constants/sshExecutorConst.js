import * as sshScripts from "./sshScriptsConst.js";

const MOVE_FILE_TO_MINIO = {
    title: 'Move File To Minio',
    descGenerator: (sourceFile, minioLink) => `Move file to minio, ${sourceFile} ==> ${minioLink}`,
    script: sshScripts.SSH_CMD_MINIO_MOVE_SCRIPT,
}

const COPY_FILE_TO_MINIO = {
    title: 'Copy File To Minio',
    descGenerator: (sourceFile, minioLink) => `Copy file to minio, ${sourceFile} ==> ${minioLink}`,
    script: sshScripts.SSH_CMD_MINIO_COPY_SCRIPT,
}

const DOWNLOAD_FILE_TO_MINIO = {
    title: 'Download File To Minio',
    descGenerator: (sourceUrl, minioLink) => `Download file to minio, ${sourceUrl} ==> ${minioLink}`,
    script: sshScripts.SSH_CMD_MINIO_DOWNLOAD_SCRIPT,
}

const REMOVE_REMOTE_FILE = {
    title: 'Remove Remote File',
    descGenerator: (...files) => `Remove remote files: ${files.join(', ')}`,
    script: sshScripts.SSH_CMD_BATCH_DELETE_SIMPLE
}

const CONVERT_MKV_TO_MP4 = {
    title: 'Convert File Mkv To Mp4',
    descGenerator: (mkvFilePath, mp4FilePath) => `Convert file mkv to mp4: ${mkvFilePath} -> ${mp4FilePath}`,
    script: sshScripts.SSH_CMD_FFMPEG_CONVERT_MKV_TO_MP4
}

const CONVERT_FLV_TO_MP4 = {
    title: 'Convert File Flv To Mp4',
    descGenerator: (flvFilePath, mp4FilePath) => `Convert file mkv to mp4: ${flvFilePath} -> ${mp4FilePath}`,
    script: sshScripts.SSH_CMD_FFMPEG_CONVERT_FLV_TO_MP4
}

const EXTRACT_MKV_SUBTITLE = {
    title: `Extract mkv file's subtitles`,
    descGenerator: (filePath) => `Extract mkv file's subtitles: ${filePath} -> ${filePath}.subtitle`,
    script: sshScripts.SSH_CMD_FFMPEG_EXTRACT_MKV_SUBTITLES
}

const SCAN_SUBTITLES_JSON = {
    title: `Scan folder's subtitle files`,
    descGenerator: (filePath) => `Scan folder's subtitle files: ${filePath}`,
    script: sshScripts.SSH_CMD_SCAN_SUBTITLES_JSON
}

export default {
    MOVE_FILE_TO_MINIO,
    COPY_FILE_TO_MINIO,
    DOWNLOAD_FILE_TO_MINIO,
    REMOVE_REMOTE_FILE,
    CONVERT_MKV_TO_MP4,
    CONVERT_FLV_TO_MP4,
    EXTRACT_MKV_SUBTITLE,
    SCAN_SUBTITLES_JSON
}