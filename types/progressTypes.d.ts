/**
 * 媒体播放进度载荷接口定义
 */
export interface MediaProgressPayload {
  /** 平台标识 (如 'web', 'bilibili', 'emby', 'local', 'android', 'ios' 等) */
  platform: string | number;
  /** 用户唯一标识 */
  userId: string | number;
  /** 视频/媒体唯一标识 */
  videoId: string | number;
  /** 当前播放时间点 (秒) */
  currentTime: number;
  /** 视频总时长 (秒) */
  duration: number;
  /** 播放进度百分比 (0.0 ~ 1.0) */
  percentage?: number;
  /** 是否已完播 */
  isFinished?: boolean;
  /** 最后播放/上报时间戳 (毫秒) */
  updatedAt?: number;
  /** 附加扩展元数据 (如清晰度、音轨、分集标题等) */
  extra?: Record<string, any>;
}

/**
 * 媒体播放进度存储配置选项
 */
export interface ProgressStoreOptions {
  /** Redis 键名前缀命名空间 (默认 'media') */
  prefix?: string;
  /** 进度数据默认有效时长 (秒)，默认 90 天 (7776000 秒) */
  ttlSeconds?: number;
  /** 单用户在单平台下最大保留的历史条目数量 (默认 200 条) */
  maxHistoryLimit?: number;
  /** 完播判定比例阈值 (如 0.95 表示播放达到 95% 视为完播) */
  finishedThreshold?: number;
}

/**
 * 分页查询最近播放进度历史结果
 */
export interface RecentProgressListResult {
  /** 历史总条目数 */
  total: number;
  /** 当前页码 */
  pageNum: number;
  /** 每页条数 */
  pageSize: number;
  /** 播放进度记录列表 */
  list: MediaProgressPayload[];
}

/**
 * 番剧单集播放进度详情
 */
export interface AnimeEpisodeProgressItem {
  /** 集数标识 (如 1, 2, "01") */
  episode: string | number;
  /** 当前播放时间点 (秒) */
  currentTime: number;
  /** 视频总时长 (秒) */
  duration: number;
  /** 播放进度百分比 (0.0 ~ 1.0) */
  percentage: number;
  /** 是否已完播 */
  isFinished: boolean;
  /** 最后播放时间戳 (毫秒)，未播放时为 null */
  updatedAt: number | null;
  /** 附加扩展元数据 */
  extra?: Record<string, any>;
}

/**
 * 批量获取番剧多集播放进度结果
 */
export interface AnimeEpisodesProgressResult {
  /** 该番剧最近播放的一集进度记录（若均未播放则为 null） */
  latest: AnimeEpisodeProgressItem | null;
  /** 各剧集进度列表 */
  list: AnimeEpisodeProgressItem[];
  /** 以 episode 为 Key 的进度映射字典 */
  map: Record<string | number, AnimeEpisodeProgressItem | null>;
}

