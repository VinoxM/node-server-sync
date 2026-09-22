import { BaseAgentClient } from './baseAgentClient.js';

/**
 * 面向文本表示与向量嵌入场景的 Agent 客户端 (如 BGE-M3 等)
 */
export class EmbeddingAgentClient extends BaseAgentClient {
    #model;

    /**
     * @param {object} options
     * @param {string|(() => string)} options.baseURL - 服务基础地址或动态获取函数
     * @param {string} [options.model='bge-m3'] - 向量模型标识
     * @param {number} [options.defaultTimeout=60000] - 超时时间
     * @param {string} [options.name='EmbeddingAgent'] - 客户端名称
     */
    constructor(options = {}) {
        super(options);
        this.#model = options.model || 'bge-m3';
    }

    get model() {
        return this.#model;
    }

    /**
     * 将分词结果数组转换为 Qdrant 标准的稀疏向量结构 (indices 升序排列，values 为对应词频权重)
     * @param {Array<{ id: number, text?: string, special?: boolean }>} tokens - 分词列表
     * @returns {{ indices: number[], values: number[] }} 稀疏向量对象
     */
    static tokensToSparseVector(tokens) {
        if (!Array.isArray(tokens) || tokens.length === 0) {
            return { indices: [], values: [] };
        }
        const freqMap = new Map();
        for (const token of tokens) {
            // 忽略特殊标记、低位通用控制符/标点符号以及纯空白标记
            if (token.special || token.id <= 6 || !token.text || token.text.trim() === '') continue;
            const id = token.id;
            freqMap.set(id, (freqMap.get(id) || 0) + 1);
        }
        // Qdrant 稀疏向量要求 indices 严格按升序排列
        const sortedIndices = Array.from(freqMap.keys()).sort((a, b) => a - b);
        const values = sortedIndices.map(id => freqMap.get(id));
        return {
            indices: sortedIndices,
            values: values
        };
    }

    /**
     * 文本稠密嵌入向量提取转换器（Dense Embedding）
     * @param {...string|string[]} texts - 需要计算向量的文本
     * @returns {Promise<number[]|number[][]>}
     */
    async extractDense(...texts) {
        const inputTexts = texts.flat();
        if (inputTexts.length === 0) return [];

        const response = await this.postEmbeddings({
            model: this.#model,
            input: inputTexts
        });

        const embeddings = response.data?.map(item => item.embedding) || [];
        if (texts.length === 1 && !Array.isArray(texts[0])) {
            return embeddings[0] || [];
        }
        return embeddings;
    }

    /**
     * 文本稀疏向量提取转换器（Sparse Embedding）
     * @param {...string|string[]} texts - 需要分词计算稀疏词权的文本
     * @returns {Promise<{ indices: number[], values: number[] }|Array<{ indices: number[], values: number[] }>>}
     */
    async extractSparse(...texts) {
        const inputTexts = texts.flat();
        if (inputTexts.length === 0) return [];

        const tokenLists = await this.post('/tokenize', {
            inputs: inputTexts
        });

        const sparseVectors = tokenLists.map(tokens => EmbeddingAgentClient.tokensToSparseVector(tokens));
        if (texts.length === 1 && !Array.isArray(texts[0])) {
            return sparseVectors[0] || { indices: [], values: [] };
        }
        return sparseVectors;
    }

    /**
     * 文本混合向量提取转换器（同时返回 Dense 稠密向量与 Sparse 稀疏向量）
     * @param {...string|string[]} texts - 需要计算向量的文本
     * @returns {Promise<{ dense: number[], sparse: { indices: number[], values: number[] } }|Array<{ dense: number[], sparse: { indices: number[], values: number[] } }>>}
     */
    async extractHybrid(...texts) {
        const inputTexts = texts.flat();
        if (inputTexts.length === 0) return [];

        const [denseEmbeddings, tokenLists] = await Promise.all([
            this.post('/embed', { inputs: inputTexts }),
            this.post('/tokenize', { inputs: inputTexts })
        ]);

        const results = inputTexts.map((_, i) => ({
            dense: denseEmbeddings[i],
            sparse: EmbeddingAgentClient.tokensToSparseVector(tokenLists[i])
        }));

        if (texts.length === 1 && !Array.isArray(texts[0])) {
            return results[0];
        }
        return results;
    }
}

export default EmbeddingAgentClient;
