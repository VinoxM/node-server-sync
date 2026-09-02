import fs from 'fs';

/**
 * 外部 Shell / Bash 脚本懒加载导入器
 */
class ScriptImporter {
    /** @type {string} 脚本文件名标识 (相对路径 '@/src/modules/ssh/scripts') */
    #label;

    /** @type {string|null} 读取后的脚本内容文本缓存 */
    #value = null;

    /**
     * @param {string} label - 脚本文件名
     */
    constructor(label) {
        if (typeof label !== 'string' || String(label).trim().length === 0) {
            throw new Error('Script importer label is blank.');
        }
        this.#label = String(label);
    }

    /**
     * 获取脚本内容（首次访问时同步从磁盘读取，后续直接返回缓存）
     * @returns {string} 脚本字符串内容
     */
    get value() {
        if (this.#value === null) {
            this.#value = fs.readFileSync(__join('@/src/modules/ssh/scripts', this.#label)).toString();
        }
        return this.#value;
    }
}

export default ScriptImporter;