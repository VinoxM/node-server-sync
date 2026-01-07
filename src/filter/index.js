import { importFolderScripts } from "../common/configUtil.js";

export async function getApiFilters() {
    const filter = []
    const disabledFilters = Array.from(__env.get("api.filterDisabled", []))
    return importFolderScripts("@/src/filter", false, (module, name) => {
        const m = module.default;
        (!disabledFilters.includes(name) && !m.disabled && isFunction(m.doFilter)) && filter.push({ name, ...m })
    }).then(() => filter.sort((a, b) => (a.order || 0) - (b.order || 0)).map(obj => {
        const { name, doFilter } = obj
        logger(`[Server] Loaded Request Filter: ${name}`)
        return doFilter
    }))
}