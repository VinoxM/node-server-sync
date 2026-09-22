/**
 * 文本切分器：将长文本按段落/句子切分为安全大小的 Chunk 数组
 * @param {string} text - 原始长文本
 * @param {number} [maxLen=800] - 单个 Chunk 最大字数
 * @returns {string[]} 切分后的文本块数组
 */
export function splitTextIntoChunks(text, maxLen = 800) {
    if (!text || typeof text !== 'string') return [];
    const trimmedText = text.trim();
    if (!trimmedText) return [];

    // 1. 优先按换行（段落）初步切分
    const rawParagraphs = trimmedText.split(/\n+/);
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
 * 将切分并处理完毕的文本块重新拼接为完整文本
 * @param {string[]} chunks - 文本块数组
 * @param {string} [separator='\n\n'] - 分隔符
 * @returns {string} 拼接后的完整文本
 */
export function mergeChunks(chunks, separator = '\n\n') {
    if (!Array.isArray(chunks)) return '';
    return chunks.filter(c => typeof c === 'string' && c.trim().length > 0).join(separator);
}
