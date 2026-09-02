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
  /** 核心任务执行回调函数，支持同步或异步 Promise */
  jobCallback: () => any | Promise<any>;
  /** 是否忽略任务触发与完成的控制台日志输出 */
  ignoreOutput?: boolean;
  /** 失败自动重试配置策略 */
  retry?: ScheduleRetryConfig;
  /** 是否在调度器初始化注册时立即执行一次 */
  immediate?: boolean;
}

export type ScheduleJobModule = ScheduleJobConfig;
