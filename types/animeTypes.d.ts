/**
 * 番剧清洗后的标准数据结构
 */
export interface CleanedSubject {
  /** Bangumi 条目 ID */
  bangumiId: number;
  /** 原生日文名称 */
  name: string;
  /** 中文译名 */
  nameCN?: string;
  /** 别名列表 JSON 字符串 */
  nameAlias?: string;
  /** 播放平台 (如 'TV', 'TV_Short', 'WEB', 'OVA' 等) */
  platform?: string;
  /** 首播放送日期 (如 '2026-10-01') */
  airDate?: string;
  /** 放送季度 (如 '2026-10') */
  season: string;
  /** 剧情简介 */
  summary?: string;
  /** 总集数 */
  totalEpisodes?: number;
  /** 封面图 MinIO 相对路径 */
  cover?: string;
  /** 标签元数据 JSON 字符串 */
  metaTags?: string;
  /** 制作人员 Staff JSON 字符串 */
  staff?: string;
  /** 角色声优 JSON 字符串 */
  characters?: string;
  /** 是否隐藏 (0 或 1) */
  hide?: number;
  /** 是否包含限制级内容 (0 或 1) */
  nsfw?: number;
}

/**
 * 番剧拉取与导入配置选项
 */
export interface SubjectPullOptions {
  /** 是否强制更新已存在条目 */
  forceUpdate?: boolean;
  /** 强制更新时指定更新的属性字段列表 */
  updateProperties?: string[];
  /** 是否同步插入或关联 RSS 订阅基础记录 */
  insertSubscribe?: boolean;
  /** 单次拉取分页条数 */
  limit?: number;
  /** 单个请求间隔延时 (毫秒) */
  delayMs?: number;
  /** 是否跳过角色和声优信息抓取 */
  skipCharacter?: boolean;
}

/**
 * 放送日历项精简结构
 */
export interface AnimeCalendarItem {
  /** 中文名 */
  Z: string;
  /** 原生名 */
  J: string;
  /** 放送开始时间与星期紧凑字符串 (如 '2026100124304') */
  D: string;
  /** 封面路径 */
  C: string;
  /** 动画类型标志位 (isShort + isWeb) */
  T: string;
  /** 放送状态 (0-未开播, 1-连载中, 2-已完结) */
  S: number;
  /** 最新话数/集数 */
  E: number | string;
  /** 24小时内是否有更新 (0 或 1) */
  N: number;
  /** 唯一组合 ID (`subjectId:subsId`) */
  U: string;
  /** 抓取到的发布资源数 */
  R: number;
  /** 是否跨季续播 (0 或 1) */
  G: number;
  /** 总集数 */
  A: number;
}
