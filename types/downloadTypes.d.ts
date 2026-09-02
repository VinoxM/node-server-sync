/**
 * Aria2 下载任务额外选项
 */
export interface Aria2TaskOption {
  /** 下载保存目录 (相对路径或绝对路径) */
  dir?: string;
  /** 下载保存文件名 */
  out?: string;
  /** 自定义请求头 */
  header?: string | string[];
  [key: string]: any;
}

/**
 * Aria2 任务状态详情
 */
export interface Aria2TaskStatus {
  /** 任务全局唯一 ID */
  gid: string;
  /** 任务当前状态 */
  status: 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed';
  /** 文件总大小 (字节数字符串) */
  totalLength: string;
  /** 已完成下载大小 (字节数字符串) */
  completedLength: string;
  /** 已上传大小 (字节数字符串) */
  uploadLength: string;
  /** 当前下载速度 (字节/秒) */
  downloadSpeed: string;
  /** 当前上传速度 (字节/秒) */
  uploadSpeed: string;
  /** BitTorrent InfoHash */
  infoHash?: string;
  /** 做种者数量 */
  numSeeders?: string;
  /** 是否为做种者 */
  seeder?: string;
  /** 分块大小 */
  pieceLength?: string;
  /** 分块数量 */
  numPieces?: string;
  /** 连接数 */
  connections?: string;
  /** 错误码 */
  errorCode?: string;
  /** 错误信息 */
  errorMessage?: string;
  /** 任务所属目录 */
  dir?: string;
  /** 文件列表 */
  files?: Array<{
    index: string;
    path: string;
    length: string;
    completedLength: string;
    selected: string;
    uris: Array<{ uri: string; status: string }>;
  }>;
  [key: string]: any;
}

/**
 * qBittorrent 状态分组常量大类
 */
export type QBitTorrentGroupState =
  | 'DOWNLOADING'
  | 'SEEDING'
  | 'CHECKING'
  | 'QUEUED'
  | 'PAUSED'
  | 'STOPPED'
  | 'ERROR'
  | 'COMPLETE'
  | 'UNKNOWN';

/**
 * qBittorrent 种子任务详情
 */
export interface QBitTorrentInfo {
  /** 添加时间戳 */
  added_on: number;
  /** 剩余字节数 */
  amount_left: number;
  /** 是否开启自动 Torrent 管理 */
  auto_tmm: boolean;
  /** 分类 */
  category: string;
  /** 已完成字节数 */
  completed: number;
  /** 完成时间戳 */
  completion_on: number;
  /** 内容保存绝对路径 */
  content_path: string;
  /** 下载速度限制 (字节/秒) */
  dl_limit: number;
  /** 当前下载速度 (字节/秒) */
  dlspeed: number;
  /** 已下载总字节数 */
  downloaded: number;
  /** 本次会话下载字节数 */
  downloaded_session: number;
  /** 预计剩余时间 (秒) */
  eta: number;
  /** 是否强制开始 */
  force_start: boolean;
  /** 种子 InfoHash */
  hash: string;
  /** 上次活跃时间戳 */
  last_activity: number;
  /** Magnet 磁力链接 */
  magnet_uri: string;
  /** 最大分享率 */
  max_ratio: number;
  /** 最大做种时间 (秒) */
  max_seeding_time: number;
  /** 种子名称 */
  name: string;
  /** 完成者 (种子数) */
  num_complete: number;
  /** 未完成者 (下载数) */
  num_incomplete: number;
  /** 连接的下载者数 */
  num_leechs: number;
  /** 连接的做种者数 */
  num_seeds: number;
  /** 优先级 */
  priority: number;
  /** 下载进度 (0.0 ~ 1.0) */
  progress: number;
  /** 分享率 */
  ratio: number;
  /** 分享率限制 */
  ratio_limit: number;
  /** 保存目录 */
  save_path: string;
  /** 做种持续时间 (秒) */
  seeding_time: number;
  /** 做种时间限制 (秒) */
  seeding_time_limit: number;
  /** 总大小 (字节数) */
  size: number;
  /** 任务原生状态码 (如 downloading, stalledDL, pausedUP 等) */
  state: string;
  /** 标签列表 (逗号分隔) */
  tags: string;
  /** 活跃时间 (秒) */
  time_active: number;
  /** 包含全部文件的总大小 */
  total_size: number;
  /** 当前 Tracker */
  tracker: string;
  /** Tracker 总数 */
  trackers_count: number;
  /** 上传速度限制 (字节/秒) */
  up_limit: number;
  /** 已上传总字节数 */
  uploaded: number;
  /** 本次会话上传字节数 */
  uploaded_session: number;
  /** 当前上传速度 (字节/秒) */
  upspeed: number;
  [key: string]: any;
}

/**
 * qBittorrent 种子内文件信息
 */
export interface QBitTorrentFile {
  /** 文件索引号 */
  index: number;
  /** 文件名或相对路径 */
  name: string;
  /** 文件大小 (字节) */
  size: number;
  /** 文件下载进度 (0.0 ~ 1.0) */
  progress: number;
  /** 文件下载优先级 */
  priority: number;
  /** 是否为做种文件 */
  is_seed: boolean;
  /** 分块范围 */
  piece_range: number[];
  /** 可用性 */
  availability: number;
  [key: string]: any;
}
