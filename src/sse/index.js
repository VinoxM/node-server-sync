import { importFolderScripts } from "../common/configUtil.js";
import { initializeSSEStore } from "../handler/sseHandler.js";

export async function sseInitialization() {
    const disabledSSE = Array.from(__env.get("sse.disabled", []))
    const configs = {}
    return importFolderScripts("@/src/sse", true, (module, name) => {
        if (disabledSSE.includes(name)) return
        const channelConf = module.default
        const { channel, validator, ...ops } = channelConf
        if (isNotBlank(channel) && isFunction(validator) && !(channel in configs)) {
            configs[channel] = { validator, ...ops }
            __log.info(`[SSE] Loaded sse configuration: ${channel}`)
        }
    }).then(() => initializeSSEStore(configs))
}