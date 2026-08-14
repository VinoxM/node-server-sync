import ScriptImporter from "../../core/infra/scriptImporter.js";
import sshExecutorConst from "./constants/sshExecutorConst.js";

function importSshScript(label, title, descGenerator) {
    const script = new ScriptImporter(label).value;
    if (__isBlank(script)) {
        throw new Error(`Script ${label} is blank.`)
    }
    return script
}

export function initializeSshScripts() {
    const keys = Object.keys(sshExecutorConst)
    for (const key of keys) {
        const { title, descGenerator, label } = sshExecutorConst[key]
        const scriptLabel = label || key
        const script = importSshScript(scriptLabel, title, descGenerator)
        __log.debug('[Ssh Script] Initialized:', scriptLabel)
        sshExecutorConst[key].script = script
    }
}