export const MEDIA_VIDEO_STATUS = {
    ANALYSING: 0,
    PREPARED: 1,
    UPLOADING: 2,
    COMPLETE: 3,
    REMOVED: 4
}

export const MEDIA_MINIO_STATUS = {
    FAILED: -1,
    PREPARED: 0,
    DOWNLOADING: 1,
    UPLOADING: 2,
    COMPLETE: 3,
    REMOVED: 4
}

export const MEDIA_ARIA2_TASK_STATUS = {
    DOWNLOADING: 0,
    COMPLETE: 1,
    FAILED: 2,
    REMOVED: 3
}

export const MEDIA_FILTER_TYPE = {
    AUTHOR: 1,
    UNIQUE_ID: 2
}

export const MEDIA_VIDEO_MINIO_TYPE = {
    SOURCE: 1,
    COVER: 2
}

export const MEDIA_TYPE_DESCRIPTION = {
    [MEDIA_VIDEO_MINIO_TYPE.SOURCE]: "source",
    [MEDIA_VIDEO_MINIO_TYPE.COVER]: "cover"
}