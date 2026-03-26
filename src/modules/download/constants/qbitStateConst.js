export const DOWNLOADING = {
    "downloading": "正在下载数据",
    "stalledDL": "处于下载状态, 但当前没有数据传输(通常是因为没连上 Peer 或没有上传者)",
    "metaDL": "正在下载磁力链接的元数据(Fetching Metadata)",
    "forcedDL": "强制下载(忽略排队规则)",
    "allocating": "正在预分配磁盘空间"
}

export const SEEDING = {
    "uploading": "正在上传数据(做种中)",
    "stalledUP": "处于做种状态, 但当前没有数据传出",
    "forcedUP": "强制做种(忽略分享率限制或排队规则)"
}

export const CHECKING = {
    "checkingDL": "下载中断后重新启动时的文件校验",
    "checkingUP": "完成下载后或手动触发的做种文件校验",
    "checkingResumeData": "正在校验恢复数据"
}

export const QUEUED = {
    "queuedDL": "下载排队中(受限于全局最大并行下载数)",
    "queuedUP": "上传排队中(受限于全局最大并行上传数)"
}

export const PAUSED = {
    "pausedDL": "下载已暂停",
    "pausedUP": "已完成下载, 但做种已暂停"
}

export const STOPED = {
    'stoppedDL': "下载已停止"
}

export const ERROR = {
    "error": "发生错误(如磁盘空间不足、权限问题、找不到路径等)",
    "missingFiles": "找不到本地文件(通常是因为文件被手动移动或删除了)"
}

export const COMPLETE = {
    'stoppedUP': '完成下载, 停止做种'
}