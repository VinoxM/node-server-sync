import nodeSchedule from 'node-schedule';
import { importFolderScripts } from '#utils/importUtil.js';
import { Tracer } from '#core/infra/tracer.js';
import { ContextSubscribe } from '#core/context/subscribe.js';

/**
 * @typedef {import('#types/scheduleTypes.d.ts').ScheduleJobConfig} ScheduleJobConfig
 * @typedef {import('#types/scheduleTypes.d.ts').ScheduleRetryConfig} ScheduleRetryConfig
 * @typedef {import('#types/scheduleTypes.d.ts').ScheduleJobStatus} ScheduleJobStatus
 * @typedef {import('#types/scheduleTypes.d.ts').ScheduleJobSnapshot} ScheduleJobSnapshot
 * @typedef {import('#types/scheduleTypes.d.ts').GracefulShutdownResult} GracefulShutdownResult
 */

/**
 * 定时任务生命周期状态枚举
 * - `ACTIVE`: 正常参与 Cron 调度
 * - `CANCELLED`: 计划已被运行时取消，实例与静态配置保留，可查询、可手动触发、可恢复
 * @readonly
 * @enum {ScheduleJobStatus}
 */
export const ScheduleStatus = Object.freeze({
    ACTIVE: 'active',
    CANCELLED: 'cancelled'
});

/**
 * 单个定时任务实体类
 * 封装了任务生命周期管理、Cron 表达式解析调度、Trace 链路追踪、防重入互斥锁、错误重试、协同取消 (AbortController) 与运行指标统计
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

    /** @type {(signal?: AbortSignal) => any|Promise<any>} 任务执行回调函数 */
    #jobCallback;

    /** @type {boolean} 是否忽略控制台日志输出 */
    #ignoreOutput = false;

    /** @type {boolean} 是否支持协同中断当前执行 */
    #abortable = false;

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

    /** @type {AbortController|null} 当前执行批次的协同取消控制器 */
    #abortController = null;

    /** @type {Promise<void>|null} 当前正在运行的任务异步 Promise 句柄 */
    #runningPromise = null;

    /** @type {NodeJS.Timeout|null} 失败重试等待定时器 */
    #retryTimer = null;

    /** @type {ScheduleJobStatus} 任务生命周期状态 (active: 正常参与调度, cancelled: 计划已被运行时取消但实例保留可查询) */
    #status = ScheduleStatus.ACTIVE;

    /** @type {number|null} 任务计划被取消的时间戳（毫秒），未取消时为 null */
    #cancelledAt = null;

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
        const { scheduleKey, jobName, defaultCron, jobCallback, ignoreOutput, retry, immediate, abortable } = jobConfig;
        this.#rawConfig = jobConfig;
        this.#scheduleKey = scheduleKey;
        this.#jobName = jobName;
        this.#cronExpr = envConfig?.cron ?? envConfig?.corn ?? defaultCron;
        this.#jobCallback = jobCallback;
        this.#ignoreOutput = ignoreOutput ?? false;
        this.#abortable = abortable ?? false;
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
    get isAbortable() {
        return this.#abortable;
    }

    /** @returns {boolean} */
    get isRunning() {
        return this.#isRunning;
    }

    /** @returns {boolean} */
    get isAborted() {
        return Boolean(this.#abortController?.signal?.aborted);
    }

    /** @returns {ScheduleJobStatus} 任务生命周期状态 */
    get status() {
        return this.#status;
    }

    /** @returns {boolean} 任务计划是否已被运行时取消 */
    get isCancelled() {
        return this.#status === ScheduleStatus.CANCELLED;
    }

    /**
     * 标记任务计划已被运行时取消（保留实例与静态配置，仅停止参与调度）
     * 注意：必须由 `Schedule` 显式调用，不可写入 `ScheduleJob.cancel()` 内部
     * （`start()` 会先调用 `cancel(false)` 做重注册，否则会误标记为已取消）
     */
    markCancelled() {
        this.#status = ScheduleStatus.CANCELLED;
        this.#cancelledAt = Date.now();
    }

    /**
     * 清除取消标记，使任务重新具备参与调度的资格（仅改状态，不负责注册调度器）
     */
    markActive() {
        this.#status = ScheduleStatus.ACTIVE;
        this.#cancelledAt = null;
    }

    /**
     * 启动任务调度（注册 Cron 定时器并处理 immediate 首次运行）
     * @returns {this}
     */
    start() {
        if (this.isCancelled) {
            __log.warn(`[Schedule] Job [${this.#jobName}] is cancelled, schedule registration skipped.`);
            return this;
        }

        if (!this.#enabled || __isBlank(this.#cronExpr) || !__isFunction(this.#jobCallback)) {
            return this;
        }

        this.cancel(false);

        this.#nodeJob = nodeSchedule.scheduleJob(this.#cronExpr, () => {
            this.execute(false);
        });

        __log.info(`[Schedule] Job Registered: [${this.#jobName}] (Cron: "${this.#cronExpr}", Abortable: ${this.#abortable})`);

        if (this.#immediate) {
            this.execute(false);
        }

        return this;
    }

    /**
     * 恢复被运行时取消的任务计划（清除取消标记并重新注册 Cron 调度）
     * 恢复时使用的 Cron 表达式为 `updateConfig()` 期间已同步的最新配置值，不会丢失配置变更
     * @returns {boolean} 是否执行了恢复操作（原本未处于取消状态时返回 false）
     */
    resume() {
        if (!this.isCancelled) {
            return false;
        }

        this.markActive();
        this.start();
        __log.info(`[Schedule] Job Plan Resumed: [${this.#jobName}] (Cron: "${this.#cronExpr}", Enabled: ${this.#enabled})`);
        return true;
    }

    /**
     * 动态热更新配置参数（平滑切换 Cron 表达式或启停状态）
     *
     * 拆分为两个独立步骤：
     * 1. **无条件同步配置** —— 始终把最新 cron/enable 写入实例，保证快照中的 `cron` 与配置文件一致，
     *    避免已取消任务在后续 `resumeJob()` 恢复时使用过期的 Cron 表达式。
     * 2. **有条件重排调度** —— 任务处于 `cancelled` 状态时不自动注册调度器（防止热重载静默复活），
     *    仅当配置中 `enable` 发生 false -> true 的显式翻转时，才视为运维的恢复意图并重新激活。
     * @param {Record<string, any>} [envConfig={}] - 最新的环境配置对象
     */
    updateConfig(envConfig = {}) {
        const newEnabled = envConfig?.enable ?? true;
        const newCron = envConfig?.cron ?? envConfig?.corn ?? this.#rawConfig.defaultCron;

        const oldEnabled = this.#enabled;
        const oldCron = this.#cronExpr;

        const isEnabledChanged = newEnabled !== oldEnabled;
        const isCronChanged = newCron !== oldCron;

        // 1. 无条件同步最新配置，保证快照可观测性与恢复后的正确性
        this.#enabled = newEnabled;
        this.#cronExpr = newCron;

        // 2. 已取消的任务默认不参与自动重排，避免热重载导致计划静默复活
        if (this.isCancelled) {
            if (isEnabledChanged && newEnabled) {
                this.markActive();
                __log.info(`[Schedule] Job [${this.#jobName}] was cancelled but config explicitly re-enabled it, resuming schedule...`);
            } else {
                (isEnabledChanged || isCronChanged) && __log.info(`[Schedule] Job [${this.#jobName}] is cancelled; config synced (enabled: ${oldEnabled} -> ${newEnabled}, cron: "${oldCron}" -> "${newCron}") but schedule stays cancelled.`);
                return;
            }
        }

        if (!isEnabledChanged && !isCronChanged) {
            return;
        }

        __log.info(`[Schedule] Updating Job [${this.#jobName}]: enabled (${oldEnabled} -> ${newEnabled}), cron ("${oldCron}" -> "${newCron}")`);

        if (this.#enabled) {
            this.start();
        } else {
            this.cancel(true);
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
     * 触发任务执行（包含防重入检查、TraceId 绑定、AbortController 信号生成、运行耗时统计与异常重试）
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
            this.#abortController = new AbortController();
            const signal = this.#abortController.signal;

            const runType = isManual ? 'Manual Execute' : 'Execute';
            this.#ignoreOutput || __log.info(`[Schedule] Job ${runType}: ${this.#jobName}`);

            this.#runningPromise = this.#runAttempt(1, signal).finally(() => {
                this.#isRunning = false;
                this.#runningPromise = null;
                this.#abortController = null;
            });

            return this.#runningPromise;
        });
    }

    /**
     * 执行单次任务尝试及递归重试
     * @param {number} attempt - 当前尝试序号 (从 1 开始)
     * @param {AbortSignal} signal - 协同取消信号
     * @returns {Promise<void>}
     */
    async #runAttempt(attempt, signal) {
        if (signal?.aborted) {
            __log.warn(`[Schedule] Job [${this.#jobName}] was aborted before attempt ${attempt}.`);
            return;
        }

        const startTime = Date.now();
        this.#stats.lastRunTime = startTime;

        try {
            const result = this.#jobCallback(signal);
            if (__isPromise(result)) {
                await result;
            }

            if (signal?.aborted) {
                __log.warn(`[Schedule] Job [${this.#jobName}] execution aborted gracefully.`);
                return;
            }

            this.#stats.successRuns++;
            this.#stats.lastDuration = Date.now() - startTime;
            this.#clearRetryTimer();
            this.#ignoreOutput || __log.info(`[Schedule] Job Finished: ${this.#jobName} (used ${this.#stats.lastDuration}ms)`);
        } catch (ex) {
            if (signal?.aborted) {
                __log.warn(`[Schedule] Job [${this.#jobName}] aborted with error caught: ${ex?.message || ex}`);
                return;
            }

            this.#stats.failRuns++;
            this.#stats.lastDuration = Date.now() - startTime;
            __log.error(`[Schedule] Job Execute error: ${this.#jobName} (attempt ${attempt}). Cause: ${ex?.msg || ex?.message}`, ex);

            const maxCount = this.#retry?.maxCount ?? 0;
            const interval = this.#retry?.interval ?? 30000;

            if (attempt < maxCount && !signal?.aborted) {
                __log.info(`[Schedule] Job [${this.#jobName}] will retry attempt ${attempt + 1}/${maxCount} in ${interval}ms.`);
                this.#clearRetryTimer();
                await new Promise(resolve => {
                    const onAbort = () => {
                        this.#clearRetryTimer();
                        resolve();
                    };
                    signal?.addEventListener?.('abort', onAbort, { once: true });

                    this.#retryTimer = setTimeout(async () => {
                        signal?.removeEventListener?.('abort', onAbort);
                        this.#retryTimer = null;
                        if (!signal?.aborted) {
                            await Tracer.runWithPrefix(this.#generateTracePrefix(), () => {
                                return this.#runAttempt(attempt + 1, signal);
                            });
                        }
                        resolve();
                    }, interval);
                });
            } else {
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
     * 仅中止当前正在运行的任务批次（保留 Cron 定时调度与任务注册，不注销任务）
     * @param {string} [reason] - 中止原因描述
     * @returns {boolean} 是否成功向正在运行的任务发送了协同中止信号
     */
    abortExecution(reason = `Job [${this.#jobName}] current execution was manually aborted.`) {
        if (!this.#abortable) {
            __log.warn(`[Schedule] Job [${this.#jobName}] is configured as non-abortable, abort request rejected.`);
            return false;
        }
        this.#clearRetryTimer();
        if (this.#isRunning && this.#abortController) {
            this.#abortController.abort(new Error(reason));
            __log.warn(`[Schedule] Aborted current execution for Job: ${this.#jobName}`);
            return true;
        }
        return false;
    }

    /**
     * 取消当前任务调度并可选择中断正在运行中的任务
     * @param {boolean} [abortRunning=true] - 是否向当前正在执行的任务发送协同中止信号 (AbortSignal)
     */
    cancel(abortRunning = true) {
        this.#clearRetryTimer();
        if (this.#nodeJob) {
            this.#nodeJob.cancel();
            this.#nodeJob = null;
            __log.info(`[Schedule] Job Cancelled: ${this.#jobName}`);
        }
        if (abortRunning && this.#abortController && this.#abortable) {
            this.#abortController.abort(new Error(`Job [${this.#jobName}] was cancelled.`));
        }
        if (!this.#runningPromise) {
            this.#isRunning = false;
        }
    }

    /**
     * 等待当前运行中的任务异步 Promise 完成
     * @returns {Promise<void>}
     */
    async waitForCompletion() {
        if (this.#runningPromise) {
            await this.#runningPromise.catch(() => {});
        }
    }

    /**
     * 获取任务当前运行指标与快照信息
     * @returns {ScheduleJobSnapshot}
     */
    getSnapshot() {
        return {
            key: this.#scheduleKey,
            name: this.#jobName,
            cron: this.#cronExpr,
            enabled: this.#enabled,
            status: this.#status,
            cancelled: this.isCancelled,
            cancelledAt: this.#cancelledAt,
            abortable: this.#abortable,
            isRunning: this.#isRunning,
            isAborted: this.isAborted,
            nextInvocation: this.#nodeJob?.nextInvocation()?.toISOString() || null,
            stats: { ...this.#stats }
        };
    }
}

/**
 * 定时任务调度分配管理器 (单例模式)
 * 继承自 `ContextSubscribe`，支持环境配置热重载、动态任务调整、Cron 调度、协同取消与优雅停机 (Graceful Shutdown)
 */
export class Schedule extends ContextSubscribe {
    /** @type {Schedule} 全局单例实例 */
    static instance = new Schedule();

    /** @type {Map<string, ScheduleJob>} 已初始化的任务实体字典 */
    #jobs = new Map();

    /** @type {Map<string, ScheduleJobConfig>} 原始静态任务配置字典 */
    #rawConfigs = new Map();

    /** @type {boolean} 是否正在执行优雅关停流程 */
    #isShuttingDown = false;

    constructor() {
        super('Schedule', () => this.refresh(), true);
    }

    /**
     * 当前是否处于优雅关停中
     * @returns {boolean}
     */
    get isShuttingDown() {
        return this.#isShuttingDown;
    }

    /**
     * 获取全局环境配置中的 schedule 节
     * @returns {Record<string, any>}
     */
    #getScheduleConfig() {
        return __env.get('schedule', {});
    }

    /**
     * 按任务 Key 或可读名称解析任务实体（兼容调用方传递 key 或 name 两种标识）
     * @param {string} keyOrName - 任务 Key 或任务名称
     * @returns {ScheduleJob|undefined}
     */
    #resolveJob(keyOrName) {
        if (__isBlank(keyOrName)) {
            return undefined;
        }
        const job = this.#jobs.get(keyOrName);
        if (job) {
            return job;
        }
        for (const item of this.#jobs.values()) {
            if (item.name === keyOrName) {
                return item;
            }
        }
        return undefined;
    }

    /**
     * 解析任务实体，不存在时抛出业务异常
     * @param {string} keyOrName - 任务 Key 或任务名称
     * @returns {ScheduleJob}
     */
    #requireJob(keyOrName) {
        const job = this.#resolveJob(keyOrName);
        if (!job) {
            __throwMessage(`No such Job: ${keyOrName}`);
        }
        return job;
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

        // 脚本重新加载时以全新实例覆盖旧实例，同时清除历史取消标记
        const existing = this.#jobs.get(scheduleConfig.scheduleKey);
        if (existing) {
            existing.cancel(true);
            this.#jobs.delete(scheduleConfig.scheduleKey);
        }

        const job = new ScheduleJob(scheduleConfig, envConfig);
        this.#jobs.set(job.key, job);

        if (job.isEnabled && !this.#isShuttingDown) {
            job.start();
        }
    }

    /**
     * 启动并加载所有 schedule 目录下的任务脚本，并向环境管理器注册热刷新订阅
     * @returns {Promise<any>}
     */
    async start() {
        this.#isShuttingDown = false;
        this.doSubscribe();
        this.cancelAllJob(true);
        this.#rawConfigs.clear();
        return importFolderScripts("@/src/jobs/schedule", true, module => {
            this.addJob(module.default);
        });
    }

    /**
     * 配置热更新响应入口（当 YAML 或全局配置刷新时自动触发）
     */
    refresh() {
        if (this.#isShuttingDown) return;
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
                if (job.isEnabled && !this.#isShuttingDown) {
                    job.start();
                }
            }
        }
    }

    /**
     * 手动触发指定任务立即执行一次
     * 注：已取消计划的任务仍可手动执行单次（取消计划 ≠ 禁用任务）
     * @param {string} scheduleKey - 任务 Key 或任务名称
     * @returns {string}
     */
    executeJob(scheduleKey) {
        if (this.#isShuttingDown) {
            __throwMessage('Schedule dispatcher is currently shutting down, cannot execute jobs.', -5);
        }
        const job = this.#requireJob(scheduleKey);
        __log.info(`[Schedule] Job Manual Triggered: ${job.name}`);
        job.execute(true);
        return 'Job execution triggered.';
    }

    /**
     * 仅中断指定任务当前的单次执行（保留 Cron 定时调度与任务注册）
     * @param {string} scheduleKey - 任务 Key 或任务名称
     * @param {string} [reason] - 中止原因描述
     * @returns {string} 执行结果说明
     */
    abortJob(scheduleKey, reason) {
        const job = this.#requireJob(scheduleKey);
        if (!job.isAbortable) {
            __throwMessage(`Job [${job.name}] is configured as non-abortable.`);
        }
        const aborted = job.abortExecution(reason);
        return aborted
            ? `Job [${job.name}] current execution aborted.`
            : `Job [${job.name}] is not currently running.`;
    }

    /**
     * 中断所有正在运行中的任务单次执行（保留 Cron 定时调度与任务注册）
     * @param {string} [reason] - 中止原因描述
     * @returns {string[]} 成功发送中止信号的任务名称列表
     */
    abortAllJob(reason) {
        const abortedJobs = [];
        for (const job of this.#jobs.values()) {
            if (job.abortExecution(reason)) {
                abortedJobs.push(job.name);
            }
        }
        return abortedJobs;
    }

    /**
     * 取消指定任务的计划（停止参与调度，但**保留实例与静态配置**以便持续查询与恢复）
     * 取消后任务仍会出现在 `getJobSnapshots()` 结果中，快照字段 `status` 为 `cancelled`
     * @param {string} scheduleKey - 任务 Key 或任务名称
     * @param {boolean} [abortRunning=true] - 是否协同中断正在执行中的任务
     * @returns {string} 执行结果说明
     */
    cancelJob(scheduleKey, abortRunning = true) {
        const job = this.#requireJob(scheduleKey);
        if (job.isCancelled) {
            return `Job [${job.name}] plan has already been cancelled.`;
        }

        job.cancel(abortRunning);
        job.markCancelled();
        __log.info(`[Schedule] Job Plan Cancelled: [${job.name}] (instance kept for query & resume)`);
        return `Job [${job.name}] plan cancelled.`;
    }

    /**
     * 恢复指定任务的计划（清除取消标记并重新注册 Cron 调度）
     * @param {string} scheduleKey - 任务 Key 或任务名称
     * @returns {string} 执行结果说明
     */
    resumeJob(scheduleKey) {
        if (this.#isShuttingDown) {
            __throwMessage('Schedule dispatcher is currently shutting down, cannot resume jobs.', -5);
        }
        const job = this.#requireJob(scheduleKey);
        if (!job.resume()) {
            return `Job [${job.name}] is not cancelled, nothing to resume.`;
        }
        return job.isEnabled
            ? `Job [${job.name}] plan resumed.`
            : `Job [${job.name}] cancellation cleared, but current config 'enable' is false, schedule not registered.`;
    }

    /**
     * 取消并注销所有任务调度
     * @param {boolean} [abortRunning=true] - 是否协同中断正在执行中的任务
     */
    cancelAllJob(abortRunning = true) {
        for (const job of this.#jobs.values()) {
            job.cancel(abortRunning);
        }
        this.#jobs.clear();
    }

    /**
     * 优雅关停所有定时任务（取消未来计划，发送中止信号并等待所有活跃任务执行完毕）
     * @param {number} [timeoutMs=15000] - 最大等待超时时间（毫秒）
     * @returns {Promise<GracefulShutdownResult>}
     */
    async gracefulShutdown(timeoutMs = 15000) {
        if (this.#isShuttingDown) {
            return { completed: true, pendingJobs: [] };
        }

        this.#isShuttingDown = true;
        __log.info(`[Schedule] Graceful shutdown initiated (timeout: ${timeoutMs}ms)...`);

        // 1. 取消所有未触发的调度器与重试计时器，并向运行中任务广播中止信号
        for (const job of this.#jobs.values()) {
            job.cancel(true);
        }

        // 2. 收集当前正在执行中的任务
        const runningJobs = Array.from(this.#jobs.values()).filter(j => j.isRunning);

        if (runningJobs.length === 0) {
            this.destroy();
            this.#isShuttingDown = false;
            __log.info('[Schedule] Graceful shutdown completed immediately (no active running jobs).');
            return { completed: true, pendingJobs: [] };
        }

        __log.info(`[Schedule] Waiting for ${runningJobs.length} active running job(s) to drain: ${runningJobs.map(j => j.name).join(', ')}`);

        // 3. 超时竞争等待所有活跃任务完成
        let timeoutTimer;
        const timeoutPromise = new Promise(resolve => {
            timeoutTimer = setTimeout(() => resolve('TIMEOUT'), timeoutMs);
        });

        const waitPromise = Promise.all(runningJobs.map(j => j.waitForCompletion())).then(() => 'DONE');
        const outcome = await Promise.race([waitPromise, timeoutPromise]);
        clearTimeout(timeoutTimer);

        const pendingJobs = Array.from(this.#jobs.values())
            .filter(j => j.isRunning)
            .map(j => j.name);

        if (outcome === 'TIMEOUT') {
            __log.warn(`[Schedule] Graceful shutdown timed out! Active pending job(s) not finished: ${pendingJobs.join(', ')}`);
        } else {
            __log.info(`[Schedule] All active schedule jobs completed gracefully.`);
        }

        this.destroy();
        this.#isShuttingDown = false;
        return {
            completed: outcome === 'DONE',
            pendingJobs
        };
    }

    /**
     * 获取定时任务运行状态快照列表
     * 默认包含「计划已取消」的任务（取消仅停止调度，条目与静态配置保留，便于持续查询与恢复）
     * @param {{ status?: ScheduleJobStatus|null, includeCancelled?: boolean }} [options={}] - 过滤选项
     * @returns {ScheduleJobSnapshot[]}
     */
    getJobSnapshots(options = {}) {
        const { status = null, includeCancelled = true } = options;
        return Array.from(this.#jobs.values())
            .filter(job => (status
                ? job.status === status
                : (includeCancelled || !job.isCancelled)))
            .map(job => job.getSnapshot());
    }

    /**
     * 销毁调度器并注销配置订阅
     */
    destroy() {
        super.destroy();
        this.cancelAllJob(true);
        this.#rawConfigs.clear();
    }
}

/**
 * 优雅关停所有定时任务（快捷入口）
 * @param {number} [timeoutMs=15000] - 最大等待超时时间（毫秒）
 * @returns {Promise<GracefulShutdownResult>}
 */
export const gracefulShutdownSchedule = (timeoutMs = 20000) => Schedule.instance.gracefulShutdown(timeoutMs);

/**
 * 启动并加载所有定时任务（快捷入口）
 * @returns {Promise<any>}
 */
export const startSchedule = () => Schedule.instance.start();

/**
 * 取消指定定时任务计划（快捷入口）
 * 取消仅停止调度并标记状态，任务仍保留在快照中可查询，可通过 resumeJob 恢复
 * @param {string} scheduleKey - 任务标识 Key 或任务名称
 * @param {boolean} [abortRunning=true] - 是否协同中断正在执行中的任务
 * @returns {string}
 */
export const cancelJob = (scheduleKey, abortRunning = true) => Schedule.instance.cancelJob(scheduleKey, abortRunning);

/**
 * 恢复指定定时任务被取消的计划（快捷入口）
 * @param {string} scheduleKey - 任务标识 Key 或任务名称
 * @returns {string}
 */
export const resumeJob = (scheduleKey) => Schedule.instance.resumeJob(scheduleKey);

/**
 * 仅中断指定定时任务当前的单次执行（快捷入口）
 * @param {string} scheduleKey - 任务标识 Key
 * @param {string} [reason] - 中止原因描述
 * @returns {string}
 */
export const abortJob = (scheduleKey, reason) => Schedule.instance.abortJob(scheduleKey, reason);

/**
 * 中断所有正在运行中的定时任务单次执行（快捷入口）
 * @param {string} [reason] - 中止原因描述
 * @returns {string[]}
 */
export const abortAllJob = (reason) => Schedule.instance.abortAllJob(reason);

/**
 * 手动触发指定定时任务（快捷入口）
 * @param {string} scheduleKey - 任务标识 Key 或任务名称
 */
export const emitJob = (scheduleKey) => Schedule.instance.executeJob(scheduleKey);

/**
 * 获取全部定时任务运行指标快照（快捷入口）
 * @param {{ status?: ScheduleJobStatus|null, includeCancelled?: boolean }} [options] - 过滤选项
 * @returns {ScheduleJobSnapshot[]}
 */
export const getScheduleSnapshots = (options) => Schedule.instance.getJobSnapshots(options);

/** 全局调度器单例实例导出 */
export const schedule = Schedule.instance;