import axios from 'axios';

// Sakura 接口服务地址 (K3s 集群内 Service 域名)
const SAKURA_API_URL = 'http://sakura-service.llama.svc.cluster.local/v1/chat/completions';

function getSakuraApiUrl() {
    return __env.get("down-stream.sakura.url", SAKURA_API_URL);
}

// 配置参数
const CONFIG = {
    maxChunkChars: 800,      // 单个 Text Chunk 最大字符数 (建议 500~1000 字)
    concurrency: 2,          // 并发请求数 (取决于服务器 CPU/GPU 负载能力)
    temperature: 0.1,        // 低随机性，保持翻译稳定
    systemPrompt: '你是一个轻小说翻译模型，请将下面的日文文本翻译成中文。'
};

/**
 * 文本切分器：将长文本按段落/句子切分为安全大小的 Chunk 数组
 * @param {string} text - 原始日文长文本
 * @param {number} maxLen - 单个 Chunk 最大字数
 * @returns {string[]}
 */
function splitTextIntoChunks(text, maxLen = CONFIG.maxChunkChars) {
    // 1. 优先按双换行或单换行（段落）初步切分
    const rawParagraphs = text.split(/\n+/);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of rawParagraphs) {
        const trimmed = paragraph.trim();
        if (!trimmed) continue;

        // 如果单段本身就超过了 maxLen，强制按句号/感叹号/问号切分
        if (trimmed.length > maxLen) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            const sentences = trimmed.match(/[^。！？!?]+[。！？!?]+/g) || [trimmed];
            for (const sentence of sentences) {
                if ((currentChunk + sentence).length > maxLen) {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                } else {
                    currentChunk += sentence;
                }
            }
        } else if ((currentChunk + '\n' + trimmed).length > maxLen) {
            // 累加长度超过限制，推入当前 Chunk 并开启新 Chunk
            chunks.push(currentChunk.trim());
            currentChunk = trimmed;
        } else {
            currentChunk = currentChunk ? `${currentChunk}\n${trimmed}` : trimmed;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

/**
 * 单块文本翻译 API 调用
 * @param {string} chunk - 切分后的短文本
 * @returns {Promise<string>}
 */
async function translateChunk(chunk) {
    try {
        const response = await axios.post(
            getSakuraApiUrl(),
            {
                model: 'sakura',
                messages: [
                    { role: 'system', content: CONFIG.systemPrompt },
                    { role: 'user', content: chunk }
                ],
                temperature: CONFIG.temperature,
                top_p: 0.3,
                max_tokens: 1024,
                stop: ["<|im_end|>", "<|im_start|>", "<|endoftext|>"]
            },
            { timeout: 60000 } // 设置 60s 超时
        );

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        __log.error(`[Sakura] Chunk translation failed (length: ${chunk.length}):`, error.message);
        throw error;
    }
}

/**
 * 带有并发控制的异步任务池
 */
async function mapConcurrent(items, limit, fn) {
    const results = new Array(items.length);
    let index = 0;

    const worker = async () => {
        while (index < items.length) {
            const currentIndex = index++;
            results[currentIndex] = await fn(items[currentIndex], currentIndex);
        }
    };

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

/**
 * 自动切分并批量翻译长文本主函数
 * @param {string} fullText - 待翻译的日文长文本
 * @returns {Promise<string>} - 拼接完成的中文文本
 */
const translateJaToZh = async (fullText) => {
    if (!fullText || !fullText.trim()) return '';
    const chunks = splitTextIntoChunks(fullText);
    __log.debug(`[Sakura] Original text split into ${chunks.length} chunks for concurrent translation...`);
    const translatedChunks = await mapConcurrent(chunks, CONFIG.concurrency, async (chunk, idx) => {
        __log.debug(`[Sakura] Translating chunk ${idx + 1}/${chunks.length} (${chunk.length} characters)...`);
        const translated = await translateChunk(chunk);
        return translated;
    });
    __log.debug(`[Sakura] Translation complete, reassembling text...`);
    return translatedChunks.join('\n\n');
}