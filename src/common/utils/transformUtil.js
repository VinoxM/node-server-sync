import axios from 'axios';

const BGE_SERVICE_URL = 'http://bge-m3-service.llama.svc.cluster.local/v1/embeddings';

const getBgeM3ServiceUrl = () => {
    return __env.get("down-stream.bge-m3.url", BGE_SERVICE_URL);
}

/**
 * 文本嵌入转换器
 * @returns {Promise<Array<number>|Array<Array<number>>>} 返回单个文本的嵌入向量或多个文本的嵌入向量数组
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
