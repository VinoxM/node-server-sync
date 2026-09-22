/**
 * Agent 模块全局常量配置
 */

/** BGE-M3 向量嵌入服务默认 Base URL */
export const BGE_SERVICE_BASE_URL = 'http://bge-m3-service.llama.svc.cluster.local';

/** Sakura 大语言模型翻译服务默认 Base URL */
export const SAKURA_SERVICE_BASE_URL = 'http://sakura-service.llama.svc.cluster.local';

/** Qwen 大语言模型服务默认 Base URL (Ollama) */
export const QWEN_SERVICE_BASE_URL = 'http://qwen-service.llama.svc.cluster.local';

/** 提示词模板默认存放目录 */
export const AGENT_PROMPT_FOLDER = '@/src/modules/agent/prompt';

/** Sakura 翻译模型默认推理参数 */
export const SAKURA_DEFAULT_CONFIG = Object.freeze({
    model: 'sakura',
    maxChunkChars: 800,      // 单个 Text Chunk 最大字符数
    concurrency: 2,          // 并发请求数
    temperature: 0.1,        // 低随机性，保持翻译稳定
    top_p: 0.3,
    max_tokens: 1024,
    timeout: 60000,          // 60秒请求超时
    stop: ["<|im_end|>", "<|im_start|>", "<|endoftext|>"]
});

/** Qwen 模型默认推理参数 (Ollama) */
export const QWEN_DEFAULT_CONFIG = Object.freeze({
    model: 'qwen2.5:3b',
    temperature: 0.1,
    timeout: 60000,
    options: {
        num_ctx: 2048,
        frequency_penalty: 0.5,
        repeat_penalty: 1.2,
        num_predict: 256
    }
});
