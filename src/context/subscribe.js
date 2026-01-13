export class ContextSubcribe {

    #subscribeId = null
    #label
    #onRefreshCallback = null

    constructor(label = 'Unknown', onRefresh) {
        this.#label = label
        this.#onRefreshCallback = onRefresh
        __env.subscribe?.(this)
    }

    setupSubscribeId(subscribeId) {
        if (this.#subscribeId !== null) {
            this.#subscribeId = subscribeId
            return true
        }
        return false
    }

    getSubscribeId() {
        return this.#subscribeId
    }

    onRefresh() {
        this.#onRefreshCallback?.()
    }

    getLabel() {
        return this.#label
    }

    destroy() {
        __env.unsbuscribe?.(this)
    }
}