/**
 * 视频创建载荷定义
 */
export interface MediaCreateOptions {
  /** 视频唯一标识（若未传入则自动生成 UUID） */
  uniqueId?: string;
  /** 视频标题 */
  title: string;
  /** 创作者/UP主名称 */
  author: string;
  /** 分类名称 */
  category: string;
  /** 发布/上传时间 */
  uploadTime?: string | number | Date;
  /** 视频封面 URI 或链接 */
  cover?: string;
  /** 视频源文件 URI 或 URI 列表 */
  source?: string | string[] | Array<{ url: string; title?: string }>;
  /** 弹幕文件 URI 或列表 */
  barrage?: string | string[] | Array<{ url: string; title?: string }>;
  /** 关联标签数组 */
  tags?: string[];
  /** 可选的自动加入播单标题 */
  playlistTitle?: string;
}

/**
 * 视频多条件检索请求参数
 */
export interface MediaSearchOptions {
  /** 视频标题模糊匹配关键字 */
  title?: string;
  /** 分类 ID */
  category?: number;
  /** 创作者 ID */
  author?: number;
  /** 当前页码（从 1 开始，默认 1） */
  pageNum?: number;
  /** 每页条数（默认 20） */
  pageSize?: number;
  /** 标签过滤列表 */
  tags?: string[];
  /** 视频状态过滤 (MEDIA_VIDEO_STATUS) */
  status?: number;
  /** 是否在结果中附带 totalSize 总存储大小 */
  needTotalSize?: boolean;
  /** 排序规则配置 */
  orderBy?: {
    type?: 'totalSize' | 'uploadTime';
    asc?: boolean;
  };
}

/**
 * 媒体黑白名单单条校验规则
 */
export interface MediaFilterCheckRule {
  /** 创作者名称 */
  author?: string;
  /** 视频唯一标识 */
  uniqueId?: string;
}

/**
 * 媒体黑白名单校验结果项
 */
export interface MediaFilterCheckResult {
  /** 是否已在库中下载过 */
  downloaded: boolean | null;
  /** 是否被黑名单拦截 */
  blocked: boolean;
  /** 是否被白名单允许 */
  allowed: boolean;
  /** 是否最终允许入库添加 */
  canAdd: boolean;
}

/**
 * 手动创建 MinIO 对象存储任务参数
 */
export interface MediaMinioCreateOptions {
  /** 关联的视频 ID */
  videoId: number;
  /** 资源类型 (MEDIA_VIDEO_MINIO_TYPE: COVER=1, SOURCE=2, BARRAGE=3) */
  type: number;
  /** 原始抓取/本地文件 URI */
  uri: string;
  /** 排序权重 */
  sort?: number;
  /** 资源展示标题 */
  title?: string;
}
