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

/**
 * Sakura 翻译模型默认推理参数
 * 注: 后端为 llama.cpp server (/v1/chat/completions)，采样参数必须平铺为请求体顶层字段
 */
export const SAKURA_DEFAULT_CONFIG = Object.freeze({
    model: 'sakura',
    maxChunkChars: 800,      // 单个 Text Chunk 最大字符数
    concurrency: 2,          // 并发请求数
    temperature: 0.1,        // 低随机性，保持翻译稳定
    top_p: 0.3,
    max_tokens: 1024,
    repeat_penalty: 1.2,     // 重复惩罚 (llama.cpp: repeat_penalty, 1.0 表示关闭)
    timeout: 60000,          // 60秒请求超时
    stop: ["<|im_end|>", "<|im_start|>", "<|endoftext|>"]
});

/**
 * Qwen 模型默认推理参数
 * 注: 后端同样为 llama.cpp server，采样参数必须平铺；不可使用 Ollama 的 options 嵌套结构
 */
export const QWEN_DEFAULT_CONFIG = Object.freeze({
    model: 'qwen2.5:3b',
    temperature: 0.1,        // 低随机性
    max_tokens: 256,         // 单次最大生成 token 数 (llama.cpp: max_tokens / n_predict)
    repeat_penalty: 1.2,     // 重复惩罚 (llama.cpp: repeat_penalty, 1.0 表示关闭)
    frequency_penalty: 0.5,  // 频率惩罚 (llama.cpp: frequency_penalty, 0.0 表示关闭)
    timeout: 60000
    // 注: 上下文长度 (原 num_ctx) 由服务端启动参数 -c 控制, 请求级无法覆盖
});
