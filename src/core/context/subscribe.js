import { tryClone } from "../../common/utils/objectUtil.js"
import { Tracer } from "../infra/tracer.js"

export class ContextSubscribe {

    #subscribeId = null
    #label
    #onRefreshCallback = null

    constructor(label = 'Unknown', onRefresh, delaySubscribe = false) {
        this.#label = label
        this.#onRefreshCallback = onRefresh
        delaySubscribe || this.doSubscribe()
    }

    doSubscribe() {
        this.#subscribeId !== null || __env.subscribe?.(this)
    }

    setupSubscribeId(subscribeId) {
        if (this.#subscribeId === null) {
            this.#subscribeId = subscribeId
            return true
        }
        return false
    }

    getSubscribeId() {
        return this.#subscribeId
    }

    onRefresh() {
        Tracer.runClearly(() => {
            __log.debug(`[ContextSubscribe:${this.getLabel()}] Emit onRefresh callback.`)
            this.#onRefreshCallback?.()
        })
    }

    getLabel() {
        return this.#label
    }

    destroy() {
        __env.unsubscribe?.(this)
        this.#onRefreshCallback = null
    }
}

export class GetterContextSubscribe extends ContextSubscribe {
    #value = null;
    #getter = null;
    #initialized = false;
    #currentEpoch = 0;

    constructor(label, getter) {
        super(label, () => {
            const epoch = ++this.#currentEpoch;
            const res = getter?.();
            if (res instanceof Promise) {
                res.then(val => {
                    if (epoch === this.#currentEpoch) {
                        this.#value = val;
                    }
                }).catch(err => {
                    __log.error(`[GetterContextSubscribe:${label}] Async getter failed:`, err);
                });
            } else {
                this.#value = res;
            }
        }, true)
        this.#getter = getter;
    }

    getValue() {
        if (!this.#initialized) {
            this.doSubscribe();
            this.#value = this.#getter?.();
            this.#initialized = true;
        }
        return tryClone(this.#value);
    }

    destroy() {
        super.destroy();
        this.#value = null;
        this.#getter = null;
    }
}