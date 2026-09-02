import ScriptImporter from "#core/infra/scriptImporter.js";
import sshExecutorConst from "./constants/sshExecutorConst.js";

/**
 * 读取并校验指定的 SSH Shell 脚本文件内容
 * @param {string} label - 脚本文件名标识
 * @param {string} [title] - 任务标题 (用于日志)
 * @param {Function} [descGenerator] - 描述生成器
 * @returns {import('@types/sshTypes.d.ts').SshScriptImporter} 读取到的脚本文本内容
 * @throws {Error} 当脚本内容为空时抛出异常
 */
function importSshScript(label, title, descGenerator) {
    const script = new ScriptImporter(label).value;
    if (__isBlank(script)) {
        throw new Error(`Script ${label} is blank.`);
    }
    return script;
}

/**
 * 初始化并预加载所有在 `sshExecutorConst` 中定义的 SSH 远程脚本
 * 在应用启动时自动调用，将脚本内容挂载至常量对象的 `.script` 属性中
 */
export function initializeSshScripts() {
    const keys = Object.keys(sshExecutorConst);
    for (const key of keys) {
        const { title, descGenerator, label } = sshExecutorConst[key];
        const scriptLabel = label || key;
        const script = importSshScript(scriptLabel, title, descGenerator);
        __log.debug('[Ssh Script] Initialized:', scriptLabel);
        sshExecutorConst[key].script = script;
    }
}