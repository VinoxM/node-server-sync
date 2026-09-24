import { ChatAgentClient } from '../client/chatAgentClient.js';
import { PromptTemplate } from '../prompt/promptTemplate.js';
import {
    QWEN_SERVICE_BASE_URL,
    QWEN_DEFAULT_CONFIG,
    AGENT_PROMPT_FOLDER
} from '../constants/agentConst.js';

/**
 * Qwen 语言类型识别 Prompt 模板
 */
export const qwenLangDetectPrompt = new PromptTemplate({
    label: 'qwen_lang_detect.md',
    folder: AGENT_PROMPT_FOLDER
});

/**
 * Qwen 通用多语言翻译 Prompt 模板
 */
export const qwenTranslatePrompt = new PromptTemplate({
    label: 'qwen_translate.md',
    folder: AGENT_PROMPT_FOLDER
});

/**
 * 动态获取 Qwen 服务 Base URL (兼容 down-stream.qwen.baseURL 与 down-stream.qwen.url)
 * @returns {string} Base URL
 */
export function getQwenBaseURL() {
    let url = __env.get('down-stream.qwen.baseURL');
    if (!url) {
        const fullUrl = __env.get('down-stream.qwen.url', QWEN_SERVICE_BASE_URL);
        url = String(fullUrl).replace(/\/v1\/chat\/completions\/?$/, '');
    }
    return url || QWEN_SERVICE_BASE_URL;
}

/**
 * 创建 Qwen 通用对话与语言处理 Agent 实例
 */
export const qwenAgent = new ChatAgentClient({
    baseURL: getQwenBaseURL,
    model: QWEN_DEFAULT_CONFIG.model,
    defaultParams: {
        temperature: QWEN_DEFAULT_CONFIG.temperature,
        max_tokens: QWEN_DEFAULT_CONFIG.max_tokens,
        repeat_penalty: QWEN_DEFAULT_CONFIG.repeat_penalty,
        frequency_penalty: QWEN_DEFAULT_CONFIG.frequency_penalty
    },
    defaultTimeout: QWEN_DEFAULT_CONFIG.timeout,
    name: 'QwenAgent'
});

/**
 * 判定输入文本的语言类型（返回结构化对象）
 * @param {string} text - 待检测的文本
 * @param {object} [options={}] - 请求选项
 * @returns {Promise<{ language: string, reason: string }>} 结构化的识别结果
 */
export async function detectLanguage(text, options = {}) {
    if (!text || !text.trim()) {
        return { language: '未知', reason: '输入文本为空' };
    }

    const rawResponse = await qwenAgent.chat(
        [
            qwenLangDetectPrompt.toMessage('system'),
            { role: 'user', content: text }
        ],
        options
    );

    // 结构化 JSON 提取与解析容错
    try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                language: parsed.language || '未知',
                reason: parsed.reason || ''
            };
        }
    } catch {
        __log.warn('[QwenAgent] Parse language detection JSON failed, raw:', rawResponse);
    }

    return {
        language: rawResponse.trim(),
        reason: '非标准格式输出'
    };
}

/**
 * 尝试判定语言类型，出现异常时安全捕获并返回 null
 * @param {string} text - 待检测的文本
 * @param {object} [options={}] - 请求选项
 * @returns {Promise<{ language: string, reason: string }|null>}
 */
export async function tryDetectLanguage(text, options = {}) {
    try {
        return await detectLanguage(text, options);
    } catch (ex) {
        __log.error('[QwenAgent] detectLanguage failed, cause:', ex?.message || ex);
        return null;
    }
}

/**
 * 使用 Qwen 进行通用多语言翻译 (非流式)
 * @param {string} text - 原文
 * @param {object} [options={}] - 配置项
 * @param {string} [options.sourceLang='英文'] - 原语言
 * @param {string} [options.targetLang='中文'] - 目标语言
 * @returns {Promise<string>} 翻译结果
 */
export async function translateWithQwen(text, options = {}) {
    const { sourceLang = '英文', targetLang = '中文', ...restOptions } = options;
    const systemMessage = qwenTranslatePrompt.toMessage('system', { sourceLang, targetLang });

    return await qwenAgent.chat(
        [
            systemMessage,
            { role: 'user', content: text }
        ],
        restOptions
    );
}

/**
 * 使用 Qwen 进行流式通用翻译 (返回 AsyncGenerator)
 * @param {string} text - 原文
 * @param {object} [options={}] - 配置项
 * @param {string} [options.sourceLang='英文'] - 原语言
 * @param {string} [options.targetLang='中文'] - 目标语言
 * @returns {AsyncGenerator<string, void, unknown>}
 */
export async function* streamTranslateWithQwen(text, options = {}) {
    const { sourceLang = '英文', targetLang = '中文', ...restOptions } = options;
    const systemMessage = qwenTranslatePrompt.toMessage('system', { sourceLang, targetLang });

    yield* qwenAgent.streamChat(
        [
            systemMessage,
            { role: 'user', content: text }
        ],
        restOptions
    );
}

/**
 * 将 Qwen 翻译结果实时以打字机形式输出到控制台
 * @param {string} text - 原文
 * @param {object} [options={}] - 配置项
 * @param {function(string): void} [onChunk] - 每个 chunk 的回调
 * @returns {Promise<string>} 完整翻译文本
 */
export async function printStreamTranslateWithQwen(text, options = {}, onChunk = null) {
    let fullOutput = '';
    const stream = streamTranslateWithQwen(text, options);
    for await (const chunk of stream) {
        if (onChunk && typeof onChunk === 'function') {
            onChunk(chunk);
        } else {
            process.stdout.write(chunk);
        }
        fullOutput += chunk;
    }
    return fullOutput;
}
