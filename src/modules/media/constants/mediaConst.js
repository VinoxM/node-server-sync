export const MEDIA_VIDEO_STATUS = {
    ANALYZING: 0,
    PREPARED: 1,
    UPLOADING: 2,
    COMPLETE: 3,
    REMOVED: 4
}

export const MEDIA_MINIO_STATUS = {
    REMOVED: -1,
    PREPARED: 0,
    DOWNLOADING: 1,
    UPLOADING: 2,
    COMPLETE: 3,
    FAILED: 4
}

export const MEDIA_ARIA2_TASK_STATUS = {
    REMOVED: -1,
    PREPARED: 0,
    DOWNLOADING: 1,
    COMPLETE: 2,
    FAILED: 3,
}

export const MEDIA_FILTER_TYPE = {
    AUTHOR: 1,
    UNIQUE_ID: 2
}

export const MEDIA_VIDEO_MINIO_TYPE = {
    SOURCE: 1,
    COVER: 2,
    BARRAGE: 3
}

export const MEDIA_TYPE_DESCRIPTION = {
    [MEDIA_VIDEO_MINIO_TYPE.SOURCE]: "source",
    [MEDIA_VIDEO_MINIO_TYPE.COVER]: "cover",
    [MEDIA_VIDEO_MINIO_TYPE.BARRAGE]: "barrage"
}

export const MEDIA_MINIO_TYPE_MAIN = [
    MEDIA_VIDEO_MINIO_TYPE.SOURCE,
    MEDIA_VIDEO_MINIO_TYPE.COVER
]

export const MEDIA_CATEGORY_TYPE = {
    NORMAL: 0,
    INSIDE: 1
}

export const MEDIA_ALLOW_CIDR = [
    '192.168.31.0/24',
    '172.17.0.0/24',
    '127.0.0.1'
]

export const MEDIA_ALLOW_HOSTS = [
    'server.vinoxm.name',
    '28000--main--code-server--maou864--coder.vinoxm.cloud'
]

export const MEDIA_BILIVE_RECORD_EVENT_TYPE = {
    SessionStarted: 0,
    FileOpening: 1,
    FileClosed: 2,
    SessionEnded: 3,
    StreamStarted: 4,
    StreamEnded: 5
}