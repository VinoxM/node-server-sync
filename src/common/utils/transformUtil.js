import axios from 'axios';

const BGE_SERVICE_URL = 'http://bge-m3-service.llama.svc.cluster.local/v1/embeddings';

/**
 * 获取 BGE-M3 向量嵌入服务的 API URL
 * @returns {string} 服务 API 地址
 */
const getBgeM3ServiceUrl = () => {
    return __env.get("down-stream.bge-m3.url", BGE_SERVICE_URL);
}

/**
 * 文本嵌入向量提取转换器（调用下游 BGE-M3 模型服务）
 * @param {...string} texts - 需要计算向量的文本（支持传单个字符串或多个字符串）
 * @returns {Promise<Array<number>|Array<Array<number>>>} 若传单个文本返回一维向量数组 `number[]`，若传多个文本返回二维向量数组 `number[][]`
 */
export const extractTextEmbedding = async (...texts) => {
    try {
        const response = await axios.post(getBgeM3ServiceUrl(), {
            model: 'bge-m3',
            input: texts
        });
        const embeddings = response.data.data.map(item => item.embedding);
        if (embeddings.length === 1) {
            return embeddings[0];
        }
        return embeddings;
    } catch (ex) {
        let message = ex.message;
        if (ex instanceof axios.AxiosError) {
            message = ex.cause?.message || ex.message;
        }
        __log.error('[Transformer] Extract text failed:', message || ex);
        throw ex;
    }
}
