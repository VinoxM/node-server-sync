import nodeSchedule from 'node-schedule';
import { importFolderScripts } from '#utils/importUtil.js';
import { Tracer } from '#core/infra/tracer.js';
import { ContextSubscribe } from '#core/context/subscribe.js';

/**
 * @typedef {import('#types/scheduleTypes.d.ts').ScheduleJobConfig} ScheduleJobConfig
 * @typedef {import('#types/scheduleTypes.d.ts').ScheduleRetryConfig} ScheduleRetryConfig
 */

/**
 * 单个定时任务实体类
 * 封装了任务生命周期管理、Cron 表达式解析调度、Trace 链路追踪、防重入互斥锁、错误重试与运行指标统计
 */
class ScheduleJob {
    /** @type {ScheduleJobConfig} 原始静态配置 */
    #rawConfig;

    /** @type {string} 任务唯一标识 Key */
    #scheduleKey;

    /** @type {string} 任务可读名称 */
    #jobName;

    /** @type {string} 生效的 Cron 调度表达式 */
    #cronExpr;

    /** @type {() => any|Promise<any>} 任务执行回调函数 */
    #jobCallback;

    /** @type {boolean} 是否忽略控制台日志输出 */
    #ignoreOutput = false;

    /** @type {ScheduleRetryConfig|undefined} 失败重试策略 */
    #retry;

    /** @type {boolean} 是否在初始化时立即执行 */
    #immediate = false;

    /** @type {boolean} 任务是否启用 */
    #enabled = true;

    /** @type {nodeSchedule.Job|null} node-schedule 调度任务底层实例 */
    #nodeJob = null;

    /** @type {boolean} 任务当前是否正在执行中 (防重入互斥标记) */
    #isRunning = false;

    /** @type {NodeJS.Timeout|null} 失败重试等待定时器 */
    #retryTimer = null;

    /** @type {{ totalRuns: number, successRuns: number, failRuns: number, lastRunTime: number|null, lastDuration: number }} 运行统计指标 */
    #stats = {
        totalRuns: 0,
        successRuns: 0,
        failRuns: 0,
        lastRunTime: null,
        lastDuration: 0
    };

    /**
     * @param {ScheduleJobConfig} jobConfig - 任务静态配置定义
     * @param {Record<string, any>} [envConfig={}] - 全局环境配置文件中的对应 schedule.<key> 配置
     */
    constructor(jobConfig, envConfig = {}) {
        const { scheduleKey, jobName, defaultCron, jobCallback, ignoreOutput, retry, immediate } = jobConfig;
        this.#rawConfig = jobConfig;
        this.#scheduleKey = scheduleKey;
        this.#jobName = jobName;
        this.#cronExpr = envConfig?.cron ?? envConfig?.corn ?? defaultCron;
        this.#jobCallback = jobCallback;
        this.#ignoreOutput = ignoreOutput ?? false;
        this.#retry = retry;
        this.#immediate = immediate || Boolean(envConfig?.immediate);
        this.#enabled = envConfig?.enable ?? true;
    }

    /** @returns {string} */
    get key() {
        return this.#scheduleKey;
    }

    /** @returns {string} */
    get name() {
        return this.#jobName;
    }

    /** @returns {string} */
    get cron() {
        return this.#cronExpr;
    }

    /** @returns {boolean} */
    get isEnabled() {
        return this.#enabled;
    }

    /** @returns {boolean} */
    get isRunning() {
        return this.#isRunning;
    }

    /**
     * 启动任务调度（注册 Cron 定时器并处理 immediate 首次运行）
     * @returns {this}
     */
    start() {
        if (!this.#enabled || __isBlank(this.#cronExpr) || !__isFunction(this.#jobCallback)) {
            return this;
        }

        this.cancel();

        this.#nodeJob = nodeSchedule.scheduleJob(this.#cronExpr, () => {
            this.execute(false);
        });

        __log.info(`[Schedule] Job Started: [${this.#jobName}] (Cron: "${this.#cronExpr}")`);

        if (this.#immediate) {
            this.execute(false);
        }

        return this;
    }

    /**
     * 动态热更新配置参数（平滑切换 Cron 表达式或启停状态）
     * @param {Record<string, any>} [envConfig={}] - 最新的环境配置对象
     */
    updateConfig(envConfig = {}) {
        const newEnabled = envConfig?.enable ?? true;
        const newCron = envConfig?.cron ?? envConfig?.corn ?? this.#rawConfig.defaultCron;

        const isEnabledChanged = newEnabled !== this.#enabled;
        const isCronChanged = newCron !== this.#cronExpr;

        if (!isEnabledChanged && !isCronChanged) {
            return;
        }

        __log.info(`[Schedule] Updating Job [${this.#jobName}]: enabled (${this.#enabled} -> ${newEnabled}), cron ("${this.#cronExpr}" -> "${newCron}")`);

        this.#enabled = newEnabled;
        this.#cronExpr = newCron;

        if (this.#enabled) {
            this.start();
        } else {
            this.cancel();
        }
    }

    /**
     * 生成任务 TraceId 前缀
     * @returns {string}
     */
    #generateTracePrefix() {
        const acronym = String(this.#jobName)
            .split(' ')
            .map(s => s.charAt(0))
            .filter(Boolean)
            .join('')
            .toLocaleUpperCase();
        return `JOB_${acronym || 'TASK'}`;
    }

    /**
     * 触发任务执行（包含防重入检查、TraceId 绑定、运行耗时统计与异常重试）
     * @param {boolean} [isManual=false] - 是否为手动触发调用
     * @returns {Promise<void>}
     */
    async execute(isManual = false) {
        if (this.#isRunning) {
            __log.warn(`[Schedule] Job [${this.#jobName}] is currently running, skipping overlapping execution.`);
            return;
        }

        const tracePrefix = this.#generateTracePrefix();
        return Tracer.runWithPrefix(tracePrefix, async () => {
            this.#isRunning = true;
            this.#stats.totalRuns++;
            const runType = isManual ? 'Manual Execute' : 'Execute';
            this.#ignoreOutput || __log.info(`[Schedule] Job ${runType}: ${this.#jobName}`);

            await this.#runAttempt(1);
        });
    }

    /**
     * 执行单次任务尝试及递归重试
     * @param {number} attempt - 当前尝试序号 (从 1 开始)
     * @returns {Promise<void>}
     */
    async #runAttempt(attempt) {
        const startTime = Date.now();
        this.#stats.lastRunTime = startTime;

        try {
            const result = this.#jobCallback();
            if (__isPromise(result)) {
                await result;
            }
            this.#stats.successRuns++;
            this.#stats.lastDuration = Date.now() - startTime;
            this.#isRunning = false;
            this.#clearRetryTimer();
            this.#ignoreOutput || __log.info(`[Schedule] Job Finished: ${this.#jobName} (used ${this.#stats.lastDuration}ms)`);
        } catch (ex) {
            this.#stats.failRuns++;
            this.#stats.lastDuration = Date.now() - startTime;
            __log.error(`[Schedule] Job Execute error: ${this.#jobName} (attempt ${attempt}). Cause: ${ex?.msg || ex?.message}`, ex);

            const maxCount = this.#retry?.maxCount ?? 0;
            const interval = this.#retry?.interval ?? 30000;

            if (attempt < maxCount) {
                __log.info(`[Schedule] Job [${this.#jobName}] will retry attempt ${attempt + 1}/${maxCount} in ${interval}ms.`);
                this.#clearRetryTimer();
                this.#retryTimer = setTimeout(() => {
                    Tracer.runWithPrefix(this.#generateTracePrefix(), () => {
                        this.#runAttempt(attempt + 1);
                    });
                }, interval);
            } else {
                this.#isRunning = false;
                this.#clearRetryTimer();
            }
        }
    }

    /**
     * 清理当前等待中的重试定时器
     */
    #clearRetryTimer() {
        if (this.#retryTimer) {
            clearTimeout(this.#retryTimer);
            this.#retryTimer = null;
        }
    }

    /**
     * 取消当前任务调度并清除未触发的重试定时器
     */
    cancel() {
        this.#clearRetryTimer();
        if (this.#nodeJob) {
            this.#nodeJob.cancel();
            this.#nodeJob = null;
            __log.info(`[Schedule] Job Cancelled: ${this.#jobName}`);
        }
        this.#isRunning = false;
    }

    /**
     * 获取任务当前运行指标与快照信息
     * @returns {{ key: string, name: string, cron: string, enabled: boolean, isRunning: boolean, nextInvocation: string|null, stats: typeof this.#stats }}
     */
    getSnapshot() {
        return {
            key: this.#scheduleKey,
            name: this.#jobName,
            cron: this.#cronExpr,
            enabled: this.#enabled,
            isRunning: this.#isRunning,
            nextInvocation: this.#nodeJob?.nextInvocation()?.toISOString() || null,
            stats: { ...this.#stats }
        };
    }
}

/**
 * 定时任务调度分配管理器 (单例模式)
 * 继承自 `ContextSubscribe`，支持环境配置热重载、动态任务调整、Cron 调度及全流程监控
 */
export class Schedule extends ContextSubscribe {
    /** @type {Schedule} 全局单例实例 */
    static instance = new Schedule();

    /** @type {Map<string, ScheduleJob>} 已初始化的任务实体字典 */
    #jobs = new Map();

    /** @type {Map<string, ScheduleJobConfig>} 原始静态任务配置字典 */
    #rawConfigs = new Map();

    constructor() {
        super('Schedule', () => this.refresh(), true);
    }

    /**
     * 获取全局环境配置中的 schedule 节
     * @returns {Record<string, any>}
     */
    #getScheduleConfig() {
        return __env.get('schedule', {});
    }

    /**
     * 注册单个定时任务
     * @param {ScheduleJobConfig} scheduleConfig - 任务静态配置
     */
    addJob(scheduleConfig) {
        if (!scheduleConfig || __isAnyBlank(scheduleConfig.scheduleKey, scheduleConfig.jobName)) {
            return;
        }

        this.#rawConfigs.set(scheduleConfig.scheduleKey, scheduleConfig);

        const envConfigs = this.#getScheduleConfig();
        const envConfig = envConfigs[scheduleConfig.scheduleKey];

        const job = new ScheduleJob(scheduleConfig, envConfig);
        this.#jobs.set(job.key, job);

        if (job.isEnabled) {
            job.start();
        }
    }

    /**
     * 启动并加载所有 schedule 目录下的任务脚本，并向环境管理器注册热刷新订阅
     * @returns {Promise<any>}
     */
    async start() {
        this.doSubscribe();
        this.cancelAllJob();
        this.#rawConfigs.clear();
        return importFolderScripts("@/src/jobs/schedule", false, module => {
            this.addJob(module.default);
        });
    }

    /**
     * 配置热更新响应入口（当 YAML 或全局配置刷新时自动触发）
     */
    refresh() {
        __log.info('[Schedule] Configuration changed, refreshing active schedule jobs...');
        const envConfigs = this.#getScheduleConfig();

        for (const [key, rawConfig] of this.#rawConfigs.entries()) {
            const envConfig = envConfigs[key];
            let job = this.#jobs.get(key);

            if (job) {
                job.updateConfig(envConfig);
            } else {
                job = new ScheduleJob(rawConfig, envConfig);
                this.#jobs.set(key, job);
                if (job.isEnabled) {
                    job.start();
                }
            }
        }
    }

    /**
     * 手动触发指定 Key 的任务立即执行一次
     * @param {string} scheduleKey - 任务 Key
     * @returns {string}
     */
    executeJob(scheduleKey) {
        if (!this.#jobs.has(scheduleKey)) {
            __throwMessage(`No such Job: ${scheduleKey}`);
        }
        const job = this.#jobs.get(scheduleKey);
        __log.info(`[Schedule] Job Manual Triggered: ${job.name}`);
        job.execute(true);
        return 'Job execution triggered.';
    }

    /**
     * 取消并注销指定 Key 的任务
     * @param {string} scheduleKey - 任务 Key
     */
    cancelJob(scheduleKey) {
        if (!this.#jobs.has(scheduleKey)) {
            __throwMessage(`No such Job: ${scheduleKey}`);
        }
        const job = this.#jobs.get(scheduleKey);
        job.cancel();
        this.#jobs.delete(scheduleKey);
        this.#rawConfigs.delete(scheduleKey);
    }

    /**
     * 取消并注销所有正在运行的任务
     */
    cancelAllJob() {
        for (const job of this.#jobs.values()) {
            job.cancel();
        }
        this.#jobs.clear();
    }

    /**
     * 获取所有任务的运行状态快照列表
     * @returns {Array<ReturnType<ScheduleJob['getSnapshot']>>}
     */
    getJobSnapshots() {
        return Array.from(this.#jobs.values()).map(job => job.getSnapshot());
    }

    /**
     * 销毁调度器并注销配置订阅
     */
    destroy() {
        super.destroy();
        this.cancelAllJob();
        this.#rawConfigs.clear();
    }
}

/**
 * 启动并加载所有定时任务（快捷入口）
 * @returns {Promise<any>}
 */
export const startSchedule = () => Schedule.instance.start();

/**
 * 取消指定定时任务（快捷入口）
 * @param {string} scheduleKey - 任务标识 Key
 */
export const cancelJob = (scheduleKey) => Schedule.instance.cancelJob(scheduleKey);

/**
 * 手动触发指定定时任务（快捷入口）
 * @param {string} scheduleKey - 任务标识 Key
 */
export const emitJob = (scheduleKey) => Schedule.instance.executeJob(scheduleKey);

/**
 * 获取全部定时任务运行指标快照（快捷入口）
 * @returns {Array<ReturnType<ScheduleJob['getSnapshot']>>}
 */
export const getScheduleSnapshots = () => Schedule.instance.getJobSnapshots();

/** 全局调度器单例实例导出 */
export const schedule = Schedule.instance;