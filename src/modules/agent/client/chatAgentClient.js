import { BaseAgentClient } from './baseAgentClient.js';
import { PromptTemplate } from '../prompt/promptTemplate.js';

/**
 * 面向对话与文本生成场景的 Agent 客户端
 */
export class ChatAgentClient extends BaseAgentClient {
    #model;
    #systemPrompt;
    #defaultParams;

    /**
     * @param {object} options
     * @param {string|(() => string)} options.baseURL - 服务基础地址或动态获取函数
     * @param {string} options.model - 模型名称
     * @param {string|PromptTemplate} [options.systemPrompt=''] - 系统提示词或模板
     * @param {object} [options.defaultParams={}] - 默认推理超参 (temperature, top_p, max_tokens 等)
     * @param {number} [options.defaultTimeout=60000] - 超时时间
     * @param {string} [options.name='ChatAgent'] - 客户端标识名称
     */
    constructor(options = {}) {
        super(options);
        const { model, systemPrompt = '', defaultParams = {} } = options;
        if (!model) {
            throw new Error(`[${this.name}] ChatAgentClient options.model is required.`);
        }
        this.#model = model;
        this.#systemPrompt = systemPrompt;
        this.#defaultParams = defaultParams;
    }

    get model() {
        return this.#model;
    }

    get systemPrompt() {
        return this.#systemPrompt;
    }

    /**
     * 解析并组装最终的 messages 数组
     * @private
     * @param {Array<{ role: string, content: string }>} messages - 用户传入的消息列表
     * @param {object} [renderVars] - 用于渲染 PromptTemplate 的动态变量
     * @returns {Array<{ role: string, content: string }>}
     */
    #buildMessages(messages, renderVars) {
        const result = [];
        let systemContent = '';

        if (this.#systemPrompt instanceof PromptTemplate) {
            systemContent = this.#systemPrompt.render(renderVars);
        } else if (typeof this.#systemPrompt === 'string' && this.#systemPrompt.trim()) {
            systemContent = this.#systemPrompt.trim();
        }

        if (systemContent) {
            result.push({ role: 'system', content: systemContent });
        }

        if (Array.isArray(messages)) {
            result.push(...messages);
        }

        return result;
    }

    /**
     * 执行多轮对话或批量消息请求 (非流式)
     * @param {Array<{ role: string, content: string }>} messages - 消息列表
     * @param {object} [options={}] - 请求选项
     * @param {object} [options.variables] - 提示词动态渲染变量
     * @param {object} [options.params] - 覆盖默认推理参数
     * @returns {Promise<string>} 响应文本内容
     */
    async chat(messages, options = {}) {
        const { variables, params = {}, ...fetchOptions } = options;
        const payload = {
            model: this.#model,
            messages: this.#buildMessages(messages, variables),
            ...this.#defaultParams,
            ...params
        };

        const res = await this.postChat(payload, fetchOptions);
        return res.choices?.[0]?.message?.content?.trim() || '';
    }

    /**
     * 单轮提问快捷调用 (非流式)
     * @param {string} userPrompt - 用户提示词/输入内容
     * @param {object} [options={}] - 请求选项
     * @returns {Promise<string>} 响应文本内容
     */
    async ask(userPrompt, options = {}) {
        return this.chat([{ role: 'user', content: userPrompt }], options);
    }

    /**
     * 执行流式对话请求
     * @param {Array<{ role: string, content: string }>} messages - 消息列表
     * @param {object} [options={}] - 请求选项
     * @returns {AsyncGenerator<string, void, unknown>} 文本增量生成器
     */
    async *streamChat(messages, options = {}) {
        const { variables, params = {}, ...fetchOptions } = options;
        const payload = {
            model: this.#model,
            messages: this.#buildMessages(messages, variables),
            ...this.#defaultParams,
            ...params
        };

        yield* super.streamChat(payload, fetchOptions);
    }

    /**
     * 单轮提问流式快捷调用
     * @param {string} userPrompt - 用户输入
     * @param {object} [options={}] - 请求选项
     * @returns {AsyncGenerator<string, void, unknown>} 文本增量生成器
     */
    async *streamAsk(userPrompt, options = {}) {
        yield* this.streamChat([{ role: 'user', content: userPrompt }], options);
    }
}

export default ChatAgentClient;
