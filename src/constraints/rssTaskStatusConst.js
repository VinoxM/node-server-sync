export const TASK_STATUS = {
    FAILED: '0',
    DOWNLOADING: '1',
    RESOLVING: '2',
    RESOLVE_FAILED: '3',
    UPLOADING: '4',
    COMPLETE: '5',
    PARTIALLY_COMPLETE: '6',
}

export const EPISODE_STATUS = {
    PREPARED: '0',
    COMPLETE: '1',
    FAILED: '2'
}

export const EPISODE_FAILED_REASON = {
    UNKNOWN: '0',
    RESOLVE_FAILED: '1',
    EPISODE_EXISTS: '2',
    SUCCESS: '3'
}