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
    COVER: 1,
    SOURCE: 2,
    BARRAGE: 3
}

export const MEDIA_TYPE_DESCRIPTION = {
    [MEDIA_VIDEO_MINIO_TYPE.SOURCE]: "source",
    [MEDIA_VIDEO_MINIO_TYPE.COVER]: "cover",
    [MEDIA_VIDEO_MINIO_TYPE.BARRAGE]: "barrage"
}

export const MEDIA_MINIO_TYPE_MAIN = [
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

export const MEDIA_BILIVE_RECORD_EVENT_ARRAY = [
    'SessionStarted',
    'FileOpening',
    'FileClosed',
    'SessionEnded',
    'StreamStarted',
    'StreamEnded'
]

export const MEDIA_BILIVE_RECORD_EVENT_TYPE = {
    SessionStarted: 0,
    FileOpening: 1,
    FileClosed: 2,
    SessionEnded: 3,
    StreamStarted: 4,
    StreamEnded: 5
}

export const MEDIA_BILIVE_STREAM_EVENT = {
    StreamStarted: 4,
    StreamEnded: 5
}

export const MEDIA_BILIVE_SESSION_EVENT = {
    SessionStarted: 0,
    SessionEnded: 3,
}

export const MEDIA_BILIVE_FILE_EVENT = {
    FileOpening: 1,
    FileClosed: 2,
}

export const MEDIA_BILIVE_STREAM_STATUS = {
    NOT_LIVE: 0,
    STREAMING: 1,
    READY_TO_ENDED: 2
}

export const MEDIA_BILIVE_RECORD_FILE_STATUS = {
    REMOVED: -1,
    OPENING: 0,
    CLOSED: 1
}

export const MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS = {
    NOT_SYNCHRONIZED: 0,
    SYNCHRONIZING: 1,
    SYNCHRONIZED: 2,
}

export const MEDIA_POLICY_MODE_LABEL = 'MediaPolicyMode'
export const MEDIA_POLICY_MODE = {
    DEFAULT_NOT_ALLOWED: '0',
    DEFAULT_ALLOWED: '1',
}
export const MEDIA_POLICY_MODE_DEFAULT = MEDIA_POLICY_MODE.DEFAULT_ALLOWED