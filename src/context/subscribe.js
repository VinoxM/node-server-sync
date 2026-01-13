export class ContextSubcribe {

    #subscribeId = null
    #label
    #onRefreshCallback = null

    constructor(label = 'Unknown', onRefresh) {
        this.#label = label
        this.#onRefreshCallback = onRefresh
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
}