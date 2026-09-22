/**
 * Agent 统一业务服务门面 (Facade)
 * 仅对外暴露上层可直接调用的高频业务方法，隐藏底层 Client、Prompt 模板与通用管道细节
 */

// ==================== 1. 日中翻译业务 (基于 Sakura-1.5B) ====================
export {
    translateJaToZh,
    tryTranslateJaToZh,
    streamTranslateJaToZh,
    printStreamTranslate
} from './service/sakuraAgentService.js';

// ==================== 2. 文本向量提取业务 (基于 BGE-M3) ====================
export {
    extractTextEmbedding,
    extractTextSparseEmbedding,
    extractTextHybridEmbedding,
    tokensToSparseVector
} from './service/bgeM3AgentService.js';

// ==================== 3. 语言识别与通用多语言业务 (基于 Qwen2.5-3B) ====================
export {
    detectLanguage,
    tryDetectLanguage,
    translateWithQwen,
    streamTranslateWithQwen,
    printStreamTranslateWithQwen
} from './service/qwenAgentService.js';
