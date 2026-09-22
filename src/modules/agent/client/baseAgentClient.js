/**
 * 基于 Node.js 原生 fetch 的 Agent 通信基类
 * 提供通用的 HTTP 通信、SSE 流式响应解析、超时与异常拦截能力
 */
export class BaseAgentClient {
    #baseURLSupplier;
    #defaultTimeout;
    #name;

    /**
     * @param {object} options
     * @param {string|(() => string)} options.baseURL - 服务基础地址或动态获取函数
     * @param {number} [options.defaultTimeout=60000] - 默认请求超时时间 (毫秒)
     * @param {string} [options.name='Agent'] - 客户端标识名称 (用于日志)
     */
    constructor(options = {}) {
        const { baseURL, defaultTimeout = 60000, name = 'Agent' } = options;
        if (!baseURL) {
            throw new Error(`[${name}] BaseAgentClient options.baseURL is required.`);
        }
        this.#baseURLSupplier = typeof baseURL === 'function' ? baseURL : () => baseURL;
        this.#defaultTimeout = defaultTimeout;
        this.#name = name;
    }

    /** 获取当前服务基础地址 (去除末尾斜杠) */
    get baseURL() {
        const url = this.#baseURLSupplier();
        return String(url || '').replace(/\/+$/, '');
    }

    get name() {
        return this.#name;
    }

    /**
     * 底层统一下发 HTTP 请求
     * @param {string} path - 相对路径
     * @param {object} [options={}] - 请求选项
     * @returns {Promise<Response>} 原生 Response 实例
     */
    async _request(path, options = {}) {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const url = `${this.baseURL}${normalizedPath}`;
        const timeout = options.timeout ?? this.#defaultTimeout;

        // 组装超时信号与外部中断信号
        const timeoutSignal = AbortSignal.timeout(timeout);
        const signal = options.signal
            ? AbortSignal.any([timeoutSignal, options.signal])
            : timeoutSignal;

        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const fetchInit = {
            method: options.method || 'POST',
            headers,
            signal
        };

        if (options.body !== undefined) {
            fetchInit.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, fetchInit);

            if (!response.ok) {
                let errMsg = `HTTP ${response.status} ${response.statusText}`;
                try {
                    const errData = await response.json();
                    errMsg = errData?.error?.message || errData?.message || errMsg;
                } catch {
                    const text = await response.text().catch(() => '');
                    if (text) errMsg = text;
                }
                throw new Error(`[${this.#name}] Request to '${url}' failed: ${errMsg}`);
            }

            return response;
        } catch (error) {
            if (error.name === 'TimeoutError') {
                __log.error(`[${this.#name}] Request timed out after ${timeout}ms: ${url}`);
            } else {
                __log.error(`[${this.#name}] Request error: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * 发起通用的 JSON POST 请求
     * @template T
     * @param {string} path - API 路径
     * @param {any} body - 请求 Body 对象
     * @param {object} [options={}] - 额外选项
     * @returns {Promise<T>} 解析后的 JSON 对象
     */
    async post(path, body, options = {}) {
        const response = await this._request(path, {
            method: 'POST',
            body,
            ...options
        });
        return await response.json();
    }

    /**
     * 发起通用的 GET 请求
     * @template T
     * @param {string} path - API 路径
     * @param {object} [options={}] - 额外选项
     * @returns {Promise<T>} 解析后的 JSON 对象
     */
    async get(path, options = {}) {
        const response = await this._request(path, {
            method: 'GET',
            ...options
        });
        return await response.json();
    }

    /**
     * 发起非流式 OpenAI 兼容标准的 `/v1/chat/completions` 请求
     * @param {object} payload - 请求体
     * @param {object} [options={}] - 额外选项
     * @returns {Promise<object>} OpenAI 格式返回体
     */
    async postChat(payload, options = {}) {
        return this.post('/v1/chat/completions', {
            ...payload,
            stream: false
        }, options);
    }

    /**
     * 发起非流式 OpenAI 兼容标准的 `/v1/embeddings` 向量提取请求
     * @param {object} payload - 请求体
     * @param {object} [options={}] - 额外选项
     * @returns {Promise<object>} OpenAI 格式返回体
     */
    async postEmbeddings(payload, options = {}) {
        return this.post('/v1/embeddings', payload, options);
    }

    /**
     * 发起流式 OpenAI 兼容标准的 `/v1/chat/completions` 请求并逐字返回增量文本
     * @param {object} payload - 请求体
     * @param {object} [options={}] - 额外选项
     * @returns {AsyncGenerator<string, void, unknown>} 文本增量生成器 (支持 `for await (const chunk of stream)`)
     */
    async *streamChat(payload, options = {}) {
        const response = await this._request('/v1/chat/completions', {
            method: 'POST',
            body: { ...payload, stream: true },
            ...options
        });

        if (!response.body) {
            throw new Error(`[${this.#name}] Response body is null in streamChat.`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(':')) continue;

                    if (trimmed === 'data: [DONE]') {
                        return;
                    }

                    if (trimmed.startsWith('data: ')) {
                        const jsonStr = trimmed.slice(6);
                        try {
                            const data = JSON.parse(jsonStr);
                            const deltaContent = data.choices?.[0]?.delta?.content;
                            if (deltaContent !== undefined && deltaContent !== null) {
                                yield deltaContent;
                            }
                        } catch {
                            // 忽略个别畸形行
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}

export default BaseAgentClient;
