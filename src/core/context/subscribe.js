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

    #backfill = null;

    constructor(label, getter) {
        super(label, () => { this.#executeGetter(); }, true)
        this.#getter = getter;
    }

    async #executeGetter() {
        const epoch = ++this.#currentEpoch;
        const res = this.#getter?.();
        if (res instanceof Promise) {
            try {
                const val = await res;
                if (epoch === this.#currentEpoch) {
                    this.#value = val;
                }
            } catch (err) {
                __log.error(`[GetterContextSubscribe:${this.getLabel()}] Async getter failed:`, err);
            }
        } else {
            this.#value = res;
        }
    }

    getValue() {
        if (!this.#initialized) {
            this.doSubscribe();
            this.onRefresh();
            this.#initialized = true;
        }
        return tryClone(this.#value);
    }

    async getValueAsync() {
        if (!this.#initialized) {
            this.doSubscribe();
            this.#initialized = true;
            await this.#executeGetter();
        }
        return tryClone(this.#value);
    }

    destroy() {
        super.destroy();
        this.#value = null;
        this.#getter = null;
    }
}