import { EmbeddingAgentClient } from '../client/embeddingAgentClient.js';
import { BGE_SERVICE_BASE_URL } from '../constants/agentConst.js';

/**
 * 动态获取 BGE-M3 向量嵌入服务 Base URL
 * @returns {string} Base URL
 */
export function getBgeM3BaseURL() {
    return __env.get('down-stream.bge-m3.baseURL', BGE_SERVICE_BASE_URL);
}

/**
 * 创建 BGE-M3 向量 Agent 实例
 */
export const bgeM3Agent = new EmbeddingAgentClient({
    baseURL: getBgeM3BaseURL,
    model: 'bge-m3',
    defaultTimeout: 60000,
    name: 'BgeM3Agent'
});

/**
 * 将分词结果数组转换为 Qdrant 标准的稀疏向量结构
 * @param {Array<{ id: number, text?: string, special?: boolean }>} tokens
 * @returns {{ indices: number[], values: number[] }}
 */
export const tokensToSparseVector = (tokens) => {
    return EmbeddingAgentClient.tokensToSparseVector(tokens);
};

/**
 * 文本稠密嵌入向量提取转换器（Dense Embedding）
 * @param {...string|string[]} texts - 需要计算向量的文本
 * @returns {Promise<number[]|number[][]>}
 */
export const extractTextEmbedding = async (...texts) => {
    return bgeM3Agent.extractDense(...texts);
};

/**
 * 文本稀疏向量提取转换器（Sparse Embedding）
 * @param {...string|string[]} texts - 需要分词计算稀疏词权的文本
 * @returns {Promise<{ indices: number[], values: number[] }|Array<{ indices: number[], values: number[] }>>}
 */
export const extractTextSparseEmbedding = async (...texts) => {
    return bgeM3Agent.extractSparse(...texts);
};

/**
 * 文本混合向量提取转换器（同时返回 Dense 稠密向量与 Sparse 稀疏向量）
 * @param {...string|string[]} texts - 需要计算向量的文本
 * @returns {Promise<{ dense: number[], sparse: { indices: number[], values: number[] } }|Array<{ dense: number[], sparse: { indices: number[], values: number[] } }>>}
 */
export const extractTextHybridEmbedding = async (...texts) => {
    return bgeM3Agent.extractHybrid(...texts);
};
