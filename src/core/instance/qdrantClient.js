import { ContextSubscribe } from "../context/subscribe.js";
import { QdrantClient as QdrantApiClient } from '@qdrant/js-client-rest';
import { extractTextEmbedding } from "#utils/transformUtil.js";

/**
 * Qdrant 向量数据库客户端管理器 (单例模式)
 * 封装了文本语义向量化 (Embedding)、集合管理、分批 Upsert、向量语义检索与过滤查询
 */
class QdrantClient extends ContextSubscribe {
    /** @type {QdrantClient} 单例实例 */
    static instance = new QdrantClient();

    /** @type {number} 向量默认维度 (1024) */
    static DIMENSION = 1024;

    /** @type {number} 单次 upsert 最大 point 数，防止请求 body 超限 */
    static UPSERT_BATCH_SIZE = 100;

    /** @type {QdrantApiClient | null} 官方 Qdrant 客户端底层实例 */
    #client = null;

    constructor() {
        super("QdrantClient", () => this.#init(true), true);
    }

    /**
     * 获取或初始化底层 Qdrant 客户端
     * @returns {QdrantApiClient}
     */
    #getClient() {
        this.#init();
        if (!this.#client) throw new Error('QdrantClient not initialized');
        return this.#client;
    }

    /**
     * 清理客户端实例
     */
    #clean() {
        this.#client = null;
    }

    /**
     * 从全局配置读取并初始化 Qdrant Client
     * @param {boolean} [force=false] - 是否强制重新初始化
     */
    #init(force = false) {
        this.doSubscribe();
        if (this.#client !== null && !force) return;
        this.#clean();
        const opts = __env.get('qdrant.client');
        if (!opts) return;
        this.#client = new QdrantApiClient({
            host: opts.host,
            port: opts.port,
            https: parseInt(opts.port) === 443,
            apiKey: opts.apiKey
        });
        __log.info(`[QdrantClient] initialized host=${opts.host} port=${opts.port} https=${parseInt(opts.port) === 443}`);
    }

    // ─── Embedding ───────────────────────────────────────────────

    /**
     * 将文本转换为 1024 维语义向量
     * @param {string} text - 待转换文本
     * @returns {Promise<number[]>} 1024 维特征向量
     */
    async embed(text) {
        return extractTextEmbedding(text);
    }

    /**
     * 将文本列表批量转换为向量
     * @param {string[]} texts - 文本列表
     * @returns {Promise<number[][]>} 向量数组
     */
    async embedBatch(texts) {
        return Promise.all(texts.map(t => this.embed(t)));
    }

    /**
     * 将 payload 中指定字段提取并转为向量，返回 `[vector, payload]`
     * @param {Record<string, any>} payload - 携带业务属性的对象
     * @param {string} [textField='text'] - 用于生成向量的文本属性键名
     * @returns {Promise<[number[], Record<string, any>]>}
     */
    async embedPayload(payload, textField = 'text') {
        const text = payload[textField];
        if (!text) throw new Error(`Payload missing text field: "${textField}"`);
        const vector = await this.embed(text);
        return [vector, payload];
    }

    // ─── Collection ──────────────────────────────────────────────

    /**
     * 确保指定名称的集合存在（若不存在则根据 1024 维度自动创建 Cosine 集合）
     * @param {string} name - 集合名称
     * @param {Record<string, any>} [extraOpts={}] - 额外创建选项
     * @returns {Promise<boolean>} true 表示集合已存在，false 表示新建
     */
    async ensureCollection(name, extraOpts = {}) {
        const exists = await this.collectionExists(name);
        if (exists) return true;
        __log.info(`[QdrantClient] createCollection name=${name} dim=${QdrantClient.DIMENSION}`);
        await this.#getClient().createCollection(name, {
            vectors: {
                size: QdrantClient.DIMENSION,
                distance: 'Cosine',
                ...extraOpts.vectors,
            },
            ...extraOpts,
        });
        return false;
    }

    /**
     * 判断集合是否存在
     * @param {string} name - 集合名
     * @returns {Promise<boolean>}
     */
    async collectionExists(name) {
        try {
            await this.#getClient().getCollection(name);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取集合详情信息
     * @param {string} name - 集合名
     * @returns {Promise<object>}
     */
    async getCollectionInfo(name) {
        const result = await this.#getClient().getCollection(name);
        __log.debug(`[QdrantClient] getCollectionInfo name=${name}`, result);
        return result;
    }

    /**
     * 列出所有已创建的集合名称列表
     * @returns {Promise<string[]>}
     */
    async listCollections() {
        const result = await this.#getClient().getCollections();
        __log.debug(`[QdrantClient] listCollections count=${result.collections.length}`);
        return result.collections.map(c => c.name);
    }

    /**
     * 删除指定集合
     * @param {string} name - 集合名
     * @returns {Promise<boolean>}
     */
    async deleteCollection(name) {
        __log.info(`[QdrantClient] deleteCollection name=${name}`);
        await this.#getClient().deleteCollection(name);
        return true;
    }

    /**
     * 创建 payload 字段索引，以加速 filter 过滤查询
     * @param {string} collectionName - 集合名
     * @param {string} fieldName - 字段名
     * @param {"keyword"|"integer"|"float"|"geo"|"text"|"bool"|"datetime"|"uuid"|object} [fieldSchema="keyword"] - 索引类型或带参 schema
     * @param {{ wait?: boolean, timeout?: number }} [opts={}] - 额外选项
     * @returns {Promise<{ result?: { status: string, operation_id?: number }, status?: string }>}
     */
    async createPayloadIndex(collectionName, fieldName, fieldSchema = 'keyword', opts = {}) {
        __log.info(`[QdrantClient] createPayloadIndex collection=${collectionName} field=${fieldName} schema=`, fieldSchema);
        const res = await this.#getClient().createPayloadIndex(collectionName, {
            field_name: fieldName,
            field_schema: fieldSchema,
            wait: opts.wait ?? true,
            timeout: opts.timeout,
        });
        return res;
    }

    // ─── Points CRUD ─────────────────────────────────────────────

    /**
     * 写入/更新 points（自动按 batchSize 分批请求，防止包体超限）
     * @param {string} collectionName - 集合名
     * @param {Array<{ id: number|string, vector?: number[], payload?: object }>} points - 数据点列表
     * @param {{ wait?: boolean, batchSize?: number }} [opts={}] - 批量选项
     * @returns {Promise<Array<{ ids: (number|string)[], status: string, operation_id?: number }>>}
     */
    async upsert(collectionName, points, opts = {}) {
        const batchSize = opts.batchSize ?? QdrantClient.UPSERT_BATCH_SIZE;
        const results = [];
        for (let i = 0; i < points.length; i += batchSize) {
            const batch = points.slice(i, i + batchSize);
            __log.debug(`[QdrantClient] upsert collection=${collectionName} batch=[${i}-${i + batch.length})/${points.length}`);
            const result = await this.#getClient().upsert(collectionName, {
                wait: true,
                points: batch.map(p => ({
                    id: p.id,
                    vector: p.vector,
                    payload: p.payload,
                })),
                ...opts,
            });
            results.push({
                ids: batch.map(p => p.id),
                status: result.status,
                operation_id: result.operation_id,
            });
        }
        return results;
    }

    /**
     * 写入带 payload 的单条 point，自动根据 textField 提取文本并生成向量
     * @param {string} collectionName - 集合名
     * @param {{ id: number|string, payload: object, textField?: string }} item - 待插入项
     * @param {{ wait?: boolean }} [opts] - 选项
     * @returns {Promise<object>}
     */
    async upsertWithEmbed(collectionName, item, opts = {}) {
        __log.debug(`[QdrantClient] upsertWithEmbed collection=${collectionName} id=${item.id}`);
        const [vector, payload] = await this.embedPayload(item.payload, item.textField);
        return this.upsert(collectionName, [{
            id: item.id,
            vector,
            payload,
        }], opts);
    }

    /**
     * 批量写入带 payload 的 points（串行单并发模型推理避免资源卡死，写入自动分批）
     * @param {string} collectionName - 集合名
     * @param {Array<{ id: number|string, payload: object, textField?: string }>} items - 待插入项数组
     * @param {{ wait?: boolean }} [opts] - 选项
     * @returns {Promise<object[]>}
     */
    async upsertBatchWithEmbed(collectionName, items, opts = {}) {
        __log.info(`[QdrantClient] upsertBatchWithEmbed collection=${collectionName} items=${items.length}`);
        const points = [];
        // 串行推理，每次最多1个
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            __log.debug(`[QdrantClient] embedding ${i + 1}/${items.length} id=${item.id}`);
            const [vector, payload] = await this.embedPayload(item.payload, item.textField);
            points.push({ id: item.id, vector, payload });
        }
        __log.info(`[QdrantClient] embedding done, start upsert collection=${collectionName} total=${points.length}`);
        return this.upsert(collectionName, points, opts);
    }

    /**
     * 向量语义搜索
     * @param {string} collectionName - 集合名
     * @param {string|number[]} query - 查询文本（自动转向量）或原始向量数组
     * @param {{
     *   limit?: number,
     *   offset?: number,
     *   filter?: object,
     *   withPayload?: boolean,
     *   withVector?: boolean,
     *   scoreThreshold?: number,
     * }} [opts] - 搜索条件与配置
     * @returns {Promise<object[]>} 匹配的 Points 结果数组
     */
    async search(collectionName, query, opts = {}) {
        const vector = Array.isArray(query) ? query : await this.embed(query);
        __log.debug(`[QdrantClient] search collection=${collectionName} limit=${opts.limit ?? 10} threshold=${opts.scoreThreshold}`);
        const result = await this.#getClient().query(collectionName, {
            query: vector,
            limit: opts.limit ?? 10,
            offset: opts.offset,
            filter: opts.filter,
            with_payload: opts.withPayload ?? true,
            with_vector: opts.withVector ?? false,
            score_threshold: opts.scoreThreshold,
        });
        const points = result.points ?? [];
        __log.debug(`[QdrantClient] search result count=${points.length}`);
        return points;
    }

    /**
     * 分页遍历集合中的 points
     * @param {string} collectionName - 集合名
     * @param {{
     *   filter?: object,
     *   limit?: number,
     *   offset?: number,
     *   withPayload?: boolean,
     *   withVector?: boolean,
     * }} [opts] - 分页与过滤选项
     * @returns {Promise<object>}
     */
    async scroll(collectionName, opts = {}) {
        __log.debug(`[QdrantClient] scroll collection=${collectionName} limit=${opts.limit ?? 100}`);
        const result = await this.#getClient().scroll(collectionName, {
            limit: opts.limit ?? 100,
            offset: opts.offset,
            filter: opts.filter,
            with_payload: opts.withPayload ?? true,
            with_vector: opts.withVector ?? false,
        });
        __log.debug(`[QdrantClient] scroll result count=${result.points?.length ?? 0} next_offset=${result.next_page_offset}`);
        return result;
    }

    /**
     * 根据 ID 列表或 Filter 条件删除 points
     * @param {string} collectionName - 集合名
     * @param {{
     *   ids?: (number|string)[],
     *   filter?: object,
     *   wait?: boolean,
     * }} opts - 删除参数
     * @returns {Promise<object>}
     */
    async delete(collectionName, opts = {}) {
        const idCount = opts.ids?.length ?? 0;
        __log.info(`[QdrantClient] delete collection=${collectionName} ids=${idCount} filter=${!!opts.filter}`);
        const { ids, filter, ...rest } = opts;
        const result = await this.#getClient().delete(collectionName, {
            wait: true,
            points: ids,
            filter,
            ...rest,
        });
        return result;
    }

    /**
     * 根据 ID 列表检索 points
     * @param {string} collectionName - 集合名
     * @param {(number|string)[]} ids - ID 列表
     * @param {{ withPayload?: boolean, withVector?: boolean }} [opts] - 选项
     * @returns {Promise<object[]>}
     */
    async retrieve(collectionName, ids, opts = {}) {
        __log.debug(`[QdrantClient] retrieve collection=${collectionName} ids=${ids.length}`);
        const result = await this.#getClient().retrieve(collectionName, {
            ids: ids.map(id => ({ id })),
            with_payload: opts.withPayload ?? true,
            with_vector: opts.withVector ?? false,
        });
        return result;
    }

    /**
     * 统计符合条件的 points 数量
     * @param {string} collectionName - 集合名
     * @param {object} [filter] - 过滤条件
     * @returns {Promise<number>}
     */
    async count(collectionName, filter) {
        const result = await this.#getClient().count(collectionName, {
            filter,
            exact: true,
        });
        __log.debug(`[QdrantClient] count collection=${collectionName} count=${result.count}`);
        return result.count;
    }

    /**
     * 批量更新 points
     * @param {string} collectionName - 集合名
     * @param {Array<{ id: number|string, vector?: number[], payload?: object }>} points - 点数据列表
     * @returns {Promise<object[]>}
     */
    async update(collectionName, points) {
        return this.upsert(collectionName, points);
    }
}

/** Qdrant 客户端全局单例入口 */
export const qdrantClient = QdrantClient.instance;