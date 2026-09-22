import axios from 'axios';

const BGE_SERVICE_BASE_URL = 'http://bge-m3-service.llama.svc.cluster.local';

/**
 * 获取 BGE-M3 向量嵌入服务的 API Base URL
 * @returns {string} 服务 API 基础地址
 */
const getBgeM3ServiceBaseURL = () => {
    return __env.get("down-stream.bge-m3.baseURL", BGE_SERVICE_BASE_URL);
}

/**
 * 将分词结果数组转换为 Qdrant 标准的稀疏向量结构 (indices 升序排列，values 为对应词频权重)
 * @param {Array<{ id: number, text?: string, special?: boolean }>} tokens - 分词列表
 * @returns {{ indices: number[], values: number[] }} 稀疏向量对象
 */
export const tokensToSparseVector = (tokens) => {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return { indices: [], values: [] };
    }
    const freqMap = new Map();
    for (const token of tokens) {
        // 忽略特殊标记、低位通用控制符/标点符号 (id <= 6 为 <s>, <pad>, </s>, <unk>, 逗号, 句号, 空格前缀等) 以及纯空白标记
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
};

/**
 * 文本稠密嵌入向量提取转换器（Dense Embedding）
 * @param {...string} texts - 需要计算向量的文本（支持传单个字符串或多个字符串）
 * @returns {Promise<Array<number>|Array<Array<number>>>} 若传单个文本返回一维向量数组 `number[]`，若传多个文本返回二维向量数组 `number[][]`
 */
export const extractTextEmbedding = async (...texts) => {
    try {
        const inputTexts = texts.flat();
        if (inputTexts.length === 0) return [];
        const response = await axios.post(getBgeM3ServiceBaseURL() + '/v1/embeddings', {
            model: 'bge-m3',
            input: inputTexts
        });
        const embeddings = response.data.data.map(item => item.embedding);
        if (texts.length === 1 && !Array.isArray(texts[0])) {
            return embeddings[0];
        }
        return embeddings;
    } catch (ex) {
        let message = ex.message;
        if (ex instanceof axios.AxiosError) {
            message = ex.cause?.message || ex.message;
        }
        __log.error('[Transformer] Extract text embedding failed:', message || ex);
        throw ex;
    }
}

/**
 * 文本稀疏向量提取转换器（Sparse Embedding）
 * @param {...string} texts - 需要分词计算稀疏词权的文本
 * @returns {Promise<{ indices: number[], values: number[] }|Array<{ indices: number[], values: number[] }>>}
 */
export const extractTextSparseEmbedding = async (...texts) => {
    try {
        const inputTexts = texts.flat();
        if (inputTexts.length === 0) return [];
        const response = await axios.post(getBgeM3ServiceBaseURL() + '/tokenize', {
            inputs: inputTexts
        });
        const tokenLists = response.data;
        const sparseVectors = tokenLists.map(tokens => tokensToSparseVector(tokens));
        if (texts.length === 1 && !Array.isArray(texts[0])) {
            return sparseVectors[0];
        }
        return sparseVectors;
    } catch (ex) {
        let message = ex.message;
        if (ex instanceof axios.AxiosError) {
            message = ex.cause?.message || ex.message;
        }
        __log.error('[Transformer] Extract text sparse embedding failed:', message || ex);
        throw ex;
    }
}

/**
 * 文本混合向量提取转换器（同时返回 Dense 稠密向量与 Sparse 稀疏向量）
 * @param {...string} texts - 需要计算向量的文本（支持传单个字符串或多个字符串）
 * @returns {Promise<{ dense: number[], sparse: { indices: number[], values: number[] } }|Array<{ dense: number[], sparse: { indices: number[], values: number[] } }>>}
 */
export const extractTextHybridEmbedding = async (...texts) => {
    try {
        const inputTexts = texts.flat();
        if (inputTexts.length === 0) return [];
        const baseURL = getBgeM3ServiceBaseURL();

        const [embedResponse, tokenResponse] = await Promise.all([
            axios.post(baseURL + '/embed', { inputs: inputTexts }),
            axios.post(baseURL + '/tokenize', { inputs: inputTexts })
        ]);

        const denseEmbeddings = embedResponse.data;
        const tokenLists = tokenResponse.data;

        const results = inputTexts.map((_, i) => ({
            dense: denseEmbeddings[i],
            sparse: tokensToSparseVector(tokenLists[i])
        }));

        if (texts.length === 1 && !Array.isArray(texts[0])) {
            return results[0];
        }
        return results;
    } catch (ex) {
        let message = ex.message;
        if (ex instanceof axios.AxiosError) {
            message = ex.cause?.message || ex.message;
        }
        __log.error('[Transformer] Extract text hybrid embedding failed:', message || ex);
        throw ex;
    }
}
