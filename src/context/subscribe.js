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
        __log.debug(`[ContextSubscribe:${this.getLabel()}] Emit onRefresh callback.`)
        this.#onRefreshCallback?.()
    }

    getLabel() {
        return this.#label
    }

    destroy() {
        __env.unsbuscribe?.(this)
    }
}