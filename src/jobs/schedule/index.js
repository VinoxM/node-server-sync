import nodeSchedule from 'node-schedule';
import { importFolderScripts } from '../../common/utils/importUtil.js';
import { Tracer } from '../../core/infra/tracer.js';

class Schedule {
    #schedule = {};
    constructor() {
    }

    addJob(scheduleConfig) {
        const { scheduleKey, jobName, defaultCorn, jobCallback, ignoreOutput, retry, immediate } = scheduleConfig;
        if (__isAnyBlank(scheduleKey, jobName, defaultCorn) || !__isFunction(jobCallback)) return;
        const scheduleCorn = getScheduleConfig();
        if (!scheduleCorn[scheduleKey]?.enable) return;
        const resolve = () => (!ignoreOutput && __log.info(`[Schedule] Job Finished: ${jobName}.`));
        const reject = (ex, errCallback) => (error(`[Schedule] Job Execute error: ${jobName}. Cause: ${ex.msg || ex.message}`), __isFunction(errCallback) && errCallback());
        const executeJob = () => {
            const doJob = (errCallback) => {
                try {
                    const jobCall = jobCallback();
                    if (__isPromise(jobCall)) {
                        jobCall.then(resolve).catch(err => reject(err, errCallback))
                    } else {
                        resolve();
                    }
                } catch (err) {
                    reject(err, errCallback);
                }
            }
            let tryHandle = doJob;
            if (retry) {
                let retryCount = retry.maxCount ?? 3;
                let interval = retry.interval ?? 1000 * 30;
                tryHandle = (delay = 0) => {
                    retryCount--;
                    if (retryCount < 0) return;
                    setTimeout(() => {
                        doJob(() => tryHandle(interval));
                    }, delay);
                }
            }
            tryHandle();
        }
        this.#schedule[scheduleKey] = {
            name: jobName,
            job: nodeSchedule.scheduleJob(scheduleCorn[scheduleKey]?.corn || defaultCorn,
                () => Tracer.runWithPrefix(`JOB_${jobName.toLocaleUpperCase()}`, () => {
                    !ignoreOutput && __log.info(`[Schedule] Job Execute: ${jobName}`);
                    executeJob();
                })),
            execution: executeJob
        }
        __log.info(`[Schedule] Job Added: ${jobName}`);
        if (immediate || scheduleCorn[scheduleKey]?.immediate) {
            executeJob();
        }
    }

    executeJob(scheduleKey) {
        if (!this.#schedule.hasOwnProperty(scheduleKey)) {
            __throwMessage(`No such Job ${scheduleKey}`);
        }
        const schedule = this.#schedule[scheduleKey];
        if (schedule?.execution) {
            __log.info(`[Schedule] Job Manual Execute: ${schedule.name ?? 'unknown jobName'}`);
            schedule.execution()
        }
        __throwMessage(`Job has no execution.`)
    }

    cancelJob(scheduleKey) {
        if (!this.#schedule.hasOwnProperty(scheduleKey)) {
            __throwMessage(`No such Job ${scheduleKey}`);
        }
        const schedule = this.#schedule[scheduleKey];
        if (schedule?.job) {
            schedule.job.cancel();
            schedule.job = null;
        }
        Reflect.deleteProperty(this.#schedule, scheduleKey);
        __log.info(`[Schedule] Job Cancel: ${schedule?.name || 'unknown jobName'}`);
    }

    cancelAllJob() {
        Object.keys(this.#schedule).forEach(scheduleKey => {
            const schedule = this.#schedule[scheduleKey];
            if (schedule?.job) {
                schedule.job.cancel();
                schedule.job = null;
            }
            __log.info(`[Schedule] Job Cancel: ${schedule?.name || 'unknown jobName'}`);
        })
        this.#schedule = {};
    }
}

const getScheduleConfig = () => __env.get('schedule', {})

let scheduleInstance = null;

const startSchedule = () => {
    if (scheduleInstance) {
        scheduleInstance.cancelAllJob();
    } else {
        scheduleInstance = new Schedule();
    }
    return importFolderScripts("@/src/jobs/schedule", false, module => {
        scheduleInstance.addJob(module.default)
    })
}

const cancelJob = (scheduleKey) => {
    if (scheduleInstance) {
        scheduleInstance.cancelJob(scheduleKey);
    }
}

const emitJob = (scheduleKey) => {
    if (scheduleInstance) {
        scheduleInstance.executeJob(scheduleKey);
    }
}

export {
    startSchedule,
    cancelJob,
    emitJob
}