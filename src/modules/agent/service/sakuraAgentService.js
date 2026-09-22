import { ChatAgentClient } from '../client/chatAgentClient.js';
import { PromptTemplate } from '../prompt/promptTemplate.js';
import { splitTextIntoChunks, mergeChunks } from '../utils/textChunker.js';
import { mapConcurrent } from '../utils/concurrencyPool.js';
import {
    SAKURA_SERVICE_BASE_URL,
    SAKURA_DEFAULT_CONFIG,
    AGENT_PROMPT_FOLDER
} from '../constants/agentConst.js';

/**
 * Sakura 日中翻译 System Prompt 模板单例
 */
export const sakuraTranslatePrompt = new PromptTemplate({
    label: 'sakura_translate.md',
    folder: AGENT_PROMPT_FOLDER
});

/**
 * 动态获取 Sakura 服务 Base URL (兼容 down-stream.sakura.baseURL 与 down-stream.sakura.url)
 * @returns {string} Base URL
 */
export function getSakuraBaseURL() {
    let url = __env.get('down-stream.sakura.baseURL');
    if (!url) {
        const fullUrl = __env.get('down-stream.sakura.url', SAKURA_SERVICE_BASE_URL);
        url = String(fullUrl).replace(/\/v1\/chat\/completions\/?$/, '');
    }
    return url || SAKURA_SERVICE_BASE_URL;
}

/**
 * 创建 Sakura 对话/翻译 Agent 实例
 */
export const sakuraAgent = new ChatAgentClient({
    baseURL: getSakuraBaseURL,
    model: SAKURA_DEFAULT_CONFIG.model,
    systemPrompt: sakuraTranslatePrompt,
    defaultParams: {
        temperature: SAKURA_DEFAULT_CONFIG.temperature,
        top_p: SAKURA_DEFAULT_CONFIG.top_p,
        max_tokens: SAKURA_DEFAULT_CONFIG.max_tokens,
        stop: SAKURA_DEFAULT_CONFIG.stop
    },
    defaultTimeout: SAKURA_DEFAULT_CONFIG.timeout,
    name: 'SakuraAgent'
});

/**
 * 自动分块并批量并发将日文长文本翻译为中文（基于 Sakura 大语言模型）
 * @param {string} fullText - 待翻译的日文长文本
 * @param {object} [options={}] - 额外配置
 * @param {number} [options.maxChunkChars=SAKURA_DEFAULT_CONFIG.maxChunkChars] - 单 chunk 最大字数
 * @param {number} [options.concurrency=SAKURA_DEFAULT_CONFIG.concurrency] - 最大并发数
 * @param {AbortSignal} [options.signal] - 中断信号
 * @returns {Promise<string>} 翻译重组后的中文文本
 */
export async function translateJaToZh(fullText, options = {}) {
    if (!fullText || !fullText.trim()) return '';
    const maxChunkChars = options.maxChunkChars || SAKURA_DEFAULT_CONFIG.maxChunkChars;
    const concurrency = options.concurrency || SAKURA_DEFAULT_CONFIG.concurrency;

    const chunks = splitTextIntoChunks(fullText, maxChunkChars);
    __log.debug(`[Sakura] Original text split into ${chunks.length} chunks for concurrent translation...`);

    const translatedChunks = await mapConcurrent(chunks, concurrency, async (chunk, idx) => {
        __log.debug(`[Sakura] Translating chunk ${idx + 1}/${chunks.length} (${chunk.length} characters)...`);
        return await sakuraAgent.ask(chunk, { signal: options.signal });
    });

    __log.debug(`[Sakura] Translation complete, reassembling text...`);
    return mergeChunks(translatedChunks);
}

/**
 * 尝试自动分块并批量并发翻译日文长文本为中文，失败时捕获异常并返回 null
 * @param {string} fullText - 待翻译的日文长文本
 * @param {object} [options={}] - 额外配置
 * @returns {Promise<string|null>}
 */
export async function tryTranslateJaToZh(fullText, options = {}) {
    try {
        return await translateJaToZh(fullText, options);
    } catch (ex) {
        __log.error('[Sakura] Translation failed, cause:', ex?.message || ex);
        return null;
    }
}

/**
 * 流式翻译单个文本/短文本 (返回异步迭代器)
 * @param {string} text - 待翻译文本
 * @param {object} [options={}] - 请求配置
 * @returns {AsyncGenerator<string, void, unknown>} 文本增量生成器
 */
export async function* streamTranslateJaToZh(text, options = {}) {
    if (!text || !text.trim()) return;
    yield* sakuraAgent.streamAsk(text, options);
}

/**
 * 实时将翻译结果打印到终端控制台（打字机流式效果）
 * @param {string} text - 待翻译文本
 * @param {object} [options={}] - 请求配置
 * @returns {Promise<string>} 完整翻译文本
 */
export async function printStreamTranslate(text, options = {}) {
    let fullOutput = '';
    const stream = streamTranslateJaToZh(text, options);
    process.stdout.write('[Sakura Output]: ');
    for await (const delta of stream) {
        process.stdout.write(delta);
        fullOutput += delta;
    }
    process.stdout.write('\n');
    return fullOutput;
}
