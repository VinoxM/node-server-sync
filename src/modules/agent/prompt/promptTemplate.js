import fs from 'fs';
import { AGENT_PROMPT_FOLDER } from '../constants/agentConst.js';

/**
 * 提示词模板导入与动态渲染器
 * 结合了 TextImporter 的懒加载与单例缓存特性，并支持模板变量插值与热重载
 */
export class PromptTemplate {
    /** @type {string} 提示词文件所在文件夹 */
    #folder;

    /** @type {string|null} 提示词文件名 */
    #fileName;

    /** @type {string} 文件名标识 */
    #label;

    /** @type {string|null} 文本缓存 */
    #value = null;

    /**
     * @param {object} options
     * @param {string} options.label - 提示词标识或文件名 (如 'sakura_translate.md')
     * @param {string} [options.folder=AGENT_PROMPT_FOLDER] - 提示词所在文件夹
     * @param {string} [options.fileName] - 显式指定文件名
     */
    constructor(options = {}) {
        const { label, folder = AGENT_PROMPT_FOLDER, fileName } = options;
        if (typeof label !== 'string' || String(label).trim().length === 0) {
            throw new Error('PromptTemplate options.label is blank.');
        }
        this.#label = String(label);
        this.#folder = String(folder);
        this.#fileName = fileName || null;
    }

    /**
     * 获取原始模板字符串（首次访问时同步从磁盘读取，后续直接返回内存缓存）
     * @returns {string}
     */
    get raw() {
        if (this.#value === null) {
            const fileName = this.#fileName || this.#label;
            const fullPath = __join(this.#folder, fileName);
            this.#value = fs.readFileSync(fullPath, 'utf-8').trim();
        }
        return this.#value;
    }

    /**
     * 清空当前模板的内存缓存（用于开发调试时热更新 Prompt）
     * @returns {this}
     */
    reload() {
        this.#value = null;
        return this;
    }

    /**
     * 动态渲染提示词变量 (支持 `{{key}}` 占位符)
     * @param {Record<string, any>} [variables={}] - 待替换的变量键值对
     * @returns {string} 渲染后的提示词文本
     */
    render(variables = {}) {
        let content = this.raw;
        if (!variables || typeof variables !== 'object') return content;
        for (const [key, val] of Object.entries(variables)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            content = content.replace(regex, String(val ?? ''));
        }
        return content;
    }

    /**
     * 快捷生成符合 OpenAI Message 协议的对象
     * @param {'system'|'user'|'assistant'} [role='system'] - 消息角色
     * @param {Record<string, any>} [variables={}] - 变量键值对
     * @returns {{ role: string, content: string }}
     */
    toMessage(role = 'system', variables = {}) {
        return {
            role,
            content: this.render(variables)
        };
    }
}

export default PromptTemplate;
