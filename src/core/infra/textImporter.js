import fs from 'fs';

/**
 * 文件内容懒加载导入器
 */
class TextImporter {
    /** @type {string} 导入文件的文件夹 */
    #folder;

    /** @type {string|null} 导入文件的文件名 */
    #fileName;

    /** @type {string} 文件名标识 */
    #label;

    /** @type {string|null} 读取后的脚本内容文本缓存 */
    #value = null;

    /**
     * @param {string} label - 脚本文件名
     */
    constructor(options = {}) {
        const { label, folder, fileName } = options;
        if (typeof label !== 'string' || String(label).trim().length === 0) {
            throw new Error('Options label is blank.');
        }
        this.#label = String(label);
        if (typeof folder !== 'string' || String(folder).trim().length === 0) {
            throw new Error('Options folder is blank.');
        }
        this.#folder = String(folder);
        this.#fileName = fileName || null;
    }

    /**
     * 获取脚本内容（首次访问时同步从磁盘读取，后续直接返回缓存）
     * @returns {string} 脚本字符串内容
     */
    get value() {
        if (this.#value === null) {
            const fileName = this.#fileName || this.#label;
            this.#value = fs.readFileSync(__join(this.#folder, fileName)).toString();
        }
        return this.#value;
    }
}

export default TextImporter;