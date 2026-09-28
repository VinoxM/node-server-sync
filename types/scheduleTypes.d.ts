export interface ScheduleRetryConfig {
  /** 任务失败后最大重试次数，默认 3 */
  maxCount?: number;
  /** 失败重试间隔时间（毫秒），默认 30000 (30秒) */
  interval?: number;
}

export interface ScheduleJobConfig {
  /** 定时任务唯一标识 Key，与配置文件中的 schedule.<key> 对应 */
  scheduleKey: string;
  /** 定时任务可读名称 */
  jobName: string;
  /** 默认 Cron 调度表达式 (如 '0 0/5 * * * *') */
  defaultCron?: string;
  /** 核心任务执行回调函数，支持同步或异步 Promise，接收可选的 AbortSignal 用于协同取消 */
  jobCallback: (signal?: AbortSignal) => any | Promise<any>;
  /** 是否支持中断当前执行（默认 false），声明为 false 时将拦截 abort 请求 */
  abortable?: boolean;
  /** 是否忽略任务触发与完成的控制台日志输出 */
  ignoreOutput?: boolean;
  /** 失败自动重试配置策略 */
  retry?: ScheduleRetryConfig;
  /** 是否在调度器初始化注册时立即执行一次 */
  immediate?: boolean;
}

export interface GracefulShutdownResult {
  /** 是否所有正在执行的任务都在超时时间内正常完成 */
  completed: boolean;
  /** 若超时强行退出，残留未完成的任务名称列表 */
  pendingJobs: string[];
}

/**
 * 定时任务生命周期状态
 * - `active`: 正常参与 Cron 调度
 * - `cancelled`: 计划已被运行时取消，实例与静态配置保留，可查询、可手动触发、可通过 resumeJob 恢复
 */
export type ScheduleJobStatus = 'active' | 'cancelled';

/** 定时任务运行统计指标 */
export interface ScheduleJobStats {
  /** 累计执行次数 */
  totalRuns: number;
  /** 成功执行次数 */
  successRuns: number;
  /** 失败执行次数 */
  failRuns: number;
  /** 最近一次执行开始时间戳（毫秒） */
  lastRunTime: number | null;
  /** 最近一次执行耗时（毫秒） */
  lastDuration: number;
}

/** 定时任务运行状态快照 */
export interface ScheduleJobSnapshot {
  /** 任务唯一标识 Key (对应 schedule.<key>) */
  key: string;
  /** 任务可读名称 */
  name: string;
  /** 当前生效的 Cron 表达式（取消期间仍会同步配置，保持实时准确） */
  cron: string;
  /** 配置声明的启用状态 (来源于 schedule.<key>.enable) */
  enabled: boolean;
  /** 任务生命周期状态 */
  status: ScheduleJobStatus;
  /** 计划是否已被运行时取消 (等价于 status === 'cancelled') */
  cancelled: boolean;
  /** 计划被取消的时间戳（毫秒），未取消时为 null */
  cancelledAt: number | null;
  /** 是否支持协同中断当前执行 */
  abortable: boolean;
  /** 当前是否正在执行中 */
  isRunning: boolean;
  /** 当前执行是否已收到中止信号 */
  isAborted: boolean;
  /** 下一次计划触发时间 (ISO 字符串)，无计划时为 null */
  nextInvocation: string | null;
  /** 运行统计指标 */
  stats: ScheduleJobStats;
}

/** 任务快照查询过滤选项 */
export interface ScheduleJobSnapshotOptions {
  /** 仅返回指定生命周期状态的任务，为空时按 includeCancelled 规则返回 */
  status?: ScheduleJobStatus | null;
  /** 是否包含已取消计划的任务，默认 true */
  includeCancelled?: boolean;
}

export type ScheduleJobModule = ScheduleJobConfig;
