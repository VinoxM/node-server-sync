import { ContextSubscribe } from "../context/subscribe.js";
import { QdrantClient as QdrantApiClient } from '@qdrant/js-client-rest';
import { extractTextEmbedding, extractTextHybridEmbedding } from "#agent";

/**
 * Qdrant 底层连接与通用操作管理器 (模块私有，不对外导出)
 * 封装官方客户端实例、全局配置订阅与不依赖向量类型的通用集合/Point 操作
 */
class QdrantConnectionManager extends ContextSubscribe {
    /** @type {QdrantApiClient | null} 官方 Qdrant 客户端底层实例 */
    #client = null;

    constructor() {
        super("QdrantConnectionManager", () => this.#init(true), true);
    }

    /**
     * 获取或初始化底层 Qdrant 客户端
     * @returns {QdrantApiClient}
     */
    getClient() {
        this.#init();
        if (!this.#client) throw new Error('Qdrant client not initialized: missing qdrant.client configuration');
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
     * @param {boolean} [force=false]
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
        __log.info(`[QdrantConnectionManager] initialized host=${opts.host} port=${opts.port} https=${parseInt(opts.port) === 443}`);
    }

    /**
     * 判断集合是否存在
     * @param {string} name - 集合名
     * @returns {Promise<boolean>}
     */
    async collectionExists(name) {
        try {
            await this.getClient().getCollection(name);
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
        const result = await this.getClient().getCollection(name);
        __log.debug(`[Qdrant] getCollectionInfo name=${name}`, result);
        return result;
    }

    /**
     * 列出所有已创建的集合名称列表
     * @returns {Promise<string[]>}
     */
    async listCollections() {
        const result = await this.getClient().getCollections();
        __log.debug(`[Qdrant] listCollections count=${result.collections.length}`);
        return result.collections.map(c => c.name);
    }

    /**
     * 删除指定集合
     * @param {string} name - 集合名
     * @returns {Promise<boolean>}
     */
    async deleteCollection(name) {
        __log.info(`[Qdrant] deleteCollection name=${name}`);
        await this.getClient().deleteCollection(name);
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
        __log.info(`[Qdrant] createPayloadIndex collection=${collectionName} field=${fieldName} schema=`, fieldSchema);
        const res = await this.getClient().createPayloadIndex(collectionName, {
            field_name: fieldName,
            field_schema: fieldSchema,
            wait: opts.wait ?? true,
            timeout: opts.timeout,
        });
        return res;
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
        __log.debug(`[Qdrant] scroll collection=${collectionName} limit=${opts.limit ?? 100}`);
        const result = await this.getClient().scroll(collectionName, {
            limit: opts.limit ?? 100,
            offset: opts.offset,
            filter: opts.filter,
            with_payload: opts.withPayload ?? true,
            with_vector: opts.withVector ?? false,
        });
        __log.debug(`[Qdrant] scroll result count=${result.points?.length ?? 0} next_offset=${result.next_page_offset}`);
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
        __log.info(`[Qdrant] delete collection=${collectionName} ids=${idCount} filter=${!!opts.filter}`);
        const { ids, filter, ...rest } = opts;
        const result = await this.getClient().delete(collectionName, {
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
        __log.debug(`[Qdrant] retrieve collection=${collectionName} ids=${ids.length}`);
        const result = await this.getClient().retrieve(collectionName, {
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
        const result = await this.getClient().count(collectionName, {
            filter,
            exact: true,
        });
        __log.debug(`[Qdrant] count collection=${collectionName} count=${result.count}`);
        return result.count;
    }
}

/** 模块级私有连接单例（内部共享） */
const sharedConnection = new QdrantConnectionManager();

/**
 * Qdrant 单向量数据库客户端管理器 (单例模式)
 * 采用组合模式持有私有连接，封装单稠密语义向量 (Dense Embedding)、集合管理、分批 Upsert、单向量语义检索
 */
export class QdrantClient {
    /** @type {QdrantClient} 单例实例 */
    static instance = new QdrantClient();

    /** @type {number} 向量默认维度 (1024) */
    static DIMENSION = 1024;

    /** @type {number} 单次 upsert 最大 point 数，防止请求 body 超限 */
    static UPSERT_BATCH_SIZE = 100;

    /** @type {QdrantConnectionManager} 原生私有连接字段，自动绑定共享单例连接 */
    #connection = sharedConnection;

    constructor() {}

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
     * 确保指定名称的单向量集合存在（若不存在则根据 1024 维度自动创建 Cosine 集合）
     * @param {string} name - 集合名称
     * @param {Record<string, any>} [extraOpts={}] - 额外创建选项
     * @returns {Promise<boolean>} true 表示集合已存在，false 表示新建
     */
    async ensureCollection(name, extraOpts = {}) {
        const exists = await this.#connection.collectionExists(name);
        if (exists) return true;
        __log.info(`[QdrantClient] createCollection name=${name} dim=${QdrantClient.DIMENSION}`);
        await this.#connection.getClient().createCollection(name, {
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
        return this.#connection.collectionExists(name);
    }

    /**
     * 获取集合详情信息
     * @param {string} name - 集合名
     * @returns {Promise<object>}
     */
    async getCollectionInfo(name) {
        return this.#connection.getCollectionInfo(name);
    }

    /**
     * 列出所有已创建的集合名称列表
     * @returns {Promise<string[]>}
     */
    async listCollections() {
        return this.#connection.listCollections();
    }

    /**
     * 删除指定集合
     * @param {string} name - 集合名
     * @returns {Promise<boolean>}
     */
    async deleteCollection(name) {
        return this.#connection.deleteCollection(name);
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
        return this.#connection.createPayloadIndex(collectionName, fieldName, fieldSchema, opts);
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
            const result = await this.#connection.getClient().upsert(collectionName, {
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
     * 写入带 payload 的单条 point，自动根据 textField 提取文本并生成单向量
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
     * 单向量语义搜索
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
        const result = await this.#connection.getClient().query(collectionName, {
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
        return this.#connection.scroll(collectionName, opts);
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
        return this.#connection.delete(collectionName, opts);
    }

    /**
     * 根据 ID 列表检索 points
     * @param {string} collectionName - 集合名
     * @param {(number|string)[]} ids - ID 列表
     * @param {{ withPayload?: boolean, withVector?: boolean }} [opts] - 选项
     * @returns {Promise<object[]>}
     */
    async retrieve(collectionName, ids, opts = {}) {
        return this.#connection.retrieve(collectionName, ids, opts);
    }

    /**
     * 统计符合条件的 points 数量
     * @param {string} collectionName - 集合名
     * @param {object} [filter] - 过滤条件
     * @returns {Promise<number>}
     */
    async count(collectionName, filter) {
        return this.#connection.count(collectionName, filter);
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

/**
 * Qdrant 混合检索客户端管理器 (Dense + Sparse 混合检索，单例模式)
 * 采用组合模式持有私有连接，封装稠密语义向量 + 稀疏词权向量的双路提取、多向量命名集合管理、分批 Upsert 与基于 Prefetch + RRF/DBSF 的多路召回融合检索
 */
export class QdrantHybridClient {
    /** @type {QdrantHybridClient} 单例实例 */
    static instance = new QdrantHybridClient();

    /** @type {string} 稠密向量默认名称 */
    static DENSE_NAME = 'dense';

    /** @type {string} 稀疏向量默认名称 */
    static SPARSE_NAME = 'sparse';

    /** @type {number} 向量默认维度 (1024) */
    static DIMENSION = 1024;

    /** @type {number} 单次 upsert 最大 point 数，防止请求 body 超限 */
    static UPSERT_BATCH_SIZE = 100;

    /** @type {QdrantConnectionManager} 原生私有连接字段，自动绑定共享单例连接 */
    #connection = sharedConnection;

    constructor() {}

    // ─── Embedding ───────────────────────────────────────────────

    /**
     * 将文本转换为混合向量（稠密向量 + 稀疏向量）
     * @param {string} text - 待转换文本
     * @returns {Promise<{ dense: number[], sparse: { indices: number[], values: number[] } }>}
     */
    async embed(text) {
        return extractTextHybridEmbedding(text);
    }

    /**
     * 将文本列表批量转换为混合向量
     * @param {string[]} texts - 文本列表
     * @returns {Promise<Array<{ dense: number[], sparse: { indices: number[], values: number[] } }>>}
     */
    async embedBatch(texts) {
        return extractTextHybridEmbedding(...texts);
    }

    /**
     * 将 payload 中指定字段提取并转换为混合向量，返回 `[vector, payload]`
     * @param {Record<string, any>} payload - 携带业务属性的对象
     * @param {string} [textField='text'] - 用于生成向量的文本属性键名
     * @returns {Promise<[{ dense: number[], sparse: { indices: number[], values: number[] } }, Record<string, any>]>}
     */
    async embedPayload(payload, textField = 'text') {
        const text = payload[textField];
        if (!text) throw new Error(`Payload missing text field: "${textField}"`);
        const vector = await this.embed(text);
        return [vector, payload];
    }

    // ─── Collection ──────────────────────────────────────────────

    /**
     * 确保指定名称的混合检索集合存在（若不存在则自动配置 dense 与 sparse 向量并创建集合）
     * @param {string} name - 集合名称
     * @param {Record<string, any>} [extraOpts={}] - 额外创建选项
     * @param {string} [extraOpts.denseName='dense'] - 稠密向量名称
     * @param {string} [extraOpts.sparseName='sparse'] - 稀疏向量名称
     * @param {number} [extraOpts.dimension=1024] - 稠密向量维度
     * @returns {Promise<boolean>} true 表示集合已存在，false 表示新建
     */
    async ensureCollection(name, extraOpts = {}) {
        const exists = await this.#connection.collectionExists(name);
        if (exists) return true;
        const denseName = extraOpts.denseName ?? QdrantHybridClient.DENSE_NAME;
        const sparseName = extraOpts.sparseName ?? QdrantHybridClient.SPARSE_NAME;
        const dim = extraOpts.dimension ?? QdrantHybridClient.DIMENSION;
        __log.info(`[QdrantHybridClient] createCollection name=${name} dense=${denseName}(dim=${dim}) sparse=${sparseName}`);

        const vectorsConfig = {
            [denseName]: {
                size: dim,
                distance: 'Cosine',
                ...(extraOpts.vectors?.[denseName] ?? {})
            },
            ...(extraOpts.vectors ? Object.fromEntries(Object.entries(extraOpts.vectors).filter(([k]) => k !== denseName)) : {})
        };

        const sparseVectorsConfig = {
            [sparseName]: {
                modifier: 'idf',
                ...(extraOpts.sparse_vectors?.[sparseName] ?? {})
            },
            ...(extraOpts.sparse_vectors ? Object.fromEntries(Object.entries(extraOpts.sparse_vectors).filter(([k]) => k !== sparseName)) : {})
        };

        const restOpts = Object.fromEntries(
            Object.entries(extraOpts).filter(([k]) => !['vectors', 'sparse_vectors', 'denseName', 'sparseName', 'dimension'].includes(k))
        );

        await this.#connection.getClient().createCollection(name, {
            vectors: vectorsConfig,
            sparse_vectors: sparseVectorsConfig,
            ...restOpts
        });
        return false;
    }

    /**
     * 判断集合是否存在
     * @param {string} name - 集合名
     * @returns {Promise<boolean>}
     */
    async collectionExists(name) {
        return this.#connection.collectionExists(name);
    }

    /**
     * 获取集合详情信息
     * @param {string} name - 集合名
     * @returns {Promise<object>}
     */
    async getCollectionInfo(name) {
        return this.#connection.getCollectionInfo(name);
    }

    /**
     * 列出所有已创建的集合名称列表
     * @returns {Promise<string[]>}
     */
    async listCollections() {
        return this.#connection.listCollections();
    }

    /**
     * 删除指定集合
     * @param {string} name - 集合名
     * @returns {Promise<boolean>}
     */
    async deleteCollection(name) {
        return this.#connection.deleteCollection(name);
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
        return this.#connection.createPayloadIndex(collectionName, fieldName, fieldSchema, opts);
    }

    // ─── Points CRUD ─────────────────────────────────────────────

    /**
     * 写入/更新混合向量 points（自动按 batchSize 分批请求）
     * @param {string} collectionName - 集合名
     * @param {Array<{
     *   id: number|string,
     *   vector?: {
     *     dense?: number[],
     *     sparse?: { indices: number[], values: number[] },
     *     [key: string]: any
     *   },
     *   payload?: object
     * }>} points - 数据点列表
     * @param {{
     *   wait?: boolean,
     *   batchSize?: number,
     *   denseName?: string,
     *   sparseName?: string
     * }} [opts={}] - 批量选项
     * @returns {Promise<Array<{ ids: (number|string)[], status: string, operation_id?: number }>>}
     */
    async upsert(collectionName, points, opts = {}) {
        const batchSize = opts.batchSize ?? QdrantHybridClient.UPSERT_BATCH_SIZE;
        const denseName = opts.denseName ?? QdrantHybridClient.DENSE_NAME;
        const sparseName = opts.sparseName ?? QdrantHybridClient.SPARSE_NAME;
        const results = [];
        for (let i = 0; i < points.length; i += batchSize) {
            const batch = points.slice(i, i + batchSize);
            __log.debug(`[QdrantHybridClient] upsert collection=${collectionName} batch=[${i}-${i + batch.length})/${points.length}`);
            const result = await this.#connection.getClient().upsert(collectionName, {
                wait: opts.wait ?? true,
                points: batch.map(p => {
                    const vec = p.vector || {};
                    const dense = vec[denseName] ?? vec.dense;
                    const sparse = vec[sparseName] ?? vec.sparse;
                    return {
                        id: p.id,
                        vector: {
                            ...(dense ? { [denseName]: dense } : {}),
                            ...(sparse ? { [sparseName]: sparse } : {})
                        },
                        payload: p.payload
                    };
                }),
                ...opts
            });
            results.push({
                ids: batch.map(p => p.id),
                status: result.status,
                operation_id: result.operation_id
            });
        }
        return results;
    }

    /**
     * 写入带 payload 的单条 point，自动根据 textField 提取文本并生成混合向量 (Dense + Sparse)
     * @param {string} collectionName - 集合名
     * @param {{ id: number|string, payload: object, textField?: string }} item - 待插入项
     * @param {{ wait?: boolean, denseName?: string, sparseName?: string }} [opts] - 选项
     * @returns {Promise<object>}
     */
    async upsertWithEmbed(collectionName, item, opts = {}) {
        __log.debug(`[QdrantHybridClient] upsertWithEmbed collection=${collectionName} id=${item.id}`);
        const [vector, payload] = await this.embedPayload(item.payload, item.textField);
        return this.upsert(collectionName, [{
            id: item.id,
            vector,
            payload
        }], opts);
    }

    /**
     * 批量写入带 payload 的 points（串行单并发模型推理避免资源卡死，写入自动分批）
     * @param {string} collectionName - 集合名
     * @param {Array<{ id: number|string, payload: object, textField?: string }>} items - 待插入项数组
     * @param {{ wait?: boolean, denseName?: string, sparseName?: string }} [opts] - 选项
     * @returns {Promise<object[]>}
     */
    async upsertBatchWithEmbed(collectionName, items, opts = {}) {
        __log.info(`[QdrantHybridClient] upsertBatchWithEmbed collection=${collectionName} items=${items.length}`);
        const points = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            __log.debug(`[QdrantHybridClient] embedding ${i + 1}/${items.length} id=${item.id}`);
            const [vector, payload] = await this.embedPayload(item.payload, item.textField);
            points.push({ id: item.id, vector, payload });
        }
        __log.info(`[QdrantHybridClient] embedding done, start upsert collection=${collectionName} total=${points.length}`);
        return this.upsert(collectionName, points, opts);
    }

    /**
     * 混合检索 (Dense + Sparse Hybrid Search)
     * 基于 Qdrant 多路召回 Prefetch + RRF（Reciprocal Rank Fusion）/ DBSF 算法实现高效混合排序
     * @param {string} collectionName - 集合名
     * @param {string | {
     *   dense?: number[],
     *   sparse?: { indices: number[], values: number[] },
     *   queryText?: string,
     *   [key: string]: any
     * }} query - 查询文本（自动转混合向量）或显式向量对象
     * @param {{
     *   limit?: number,
     *   offset?: number,
     *   candidateLimit?: number,
     *   filter?: object,
     *   fusion?: 'rrf' | 'dbsf',
     *   rrfK?: number,
     *   weights?: number[],
     *   denseName?: string,
     *   sparseName?: string,
     *   withPayload?: boolean,
     *   withVector?: boolean,
     *   scoreThreshold?: number,
     * }} [opts={}] - 检索条件与配置
     * @returns {Promise<object[]>} 匹配的 Points 结果数组
     */
    async search(collectionName, query, opts = {}) {
        const denseName = opts.denseName ?? QdrantHybridClient.DENSE_NAME;
        const sparseName = opts.sparseName ?? QdrantHybridClient.SPARSE_NAME;
        const limit = opts.limit ?? 10;
        const candidateLimit = opts.candidateLimit ?? (limit * 2 > 20 ? limit * 2 : 20);

        let denseVector = null;
        let sparseVector = null;

        if (typeof query === 'string') {
            const hybrid = await this.embed(query);
            denseVector = hybrid.dense;
            sparseVector = hybrid.sparse;
        } else if (query && typeof query === 'object') {
            denseVector = query[denseName] ?? query.dense;
            sparseVector = query[sparseName] ?? query.sparse;
            if (!denseVector && !sparseVector && query.queryText) {
                const hybrid = await this.embed(query.queryText);
                denseVector = hybrid.dense;
                sparseVector = hybrid.sparse;
            }
        }

        const searches = [];
        let hasDense = false;
        let hasSparse = false;

        if (denseVector && denseVector.length > 0) {
            searches.push({
                query: denseVector,
                using: denseName,
                limit: candidateLimit,
                filter: opts.filter,
                score_threshold: opts.denseScoreThreshold ?? opts.scoreThreshold,
                with_payload: opts.withPayload ?? true,
                with_vector: opts.withVector ?? false
            });
            hasDense = true;
        }

        if (sparseVector && Array.isArray(sparseVector.indices) && sparseVector.indices.length > 0) {
            searches.push({
                query: {
                    indices: sparseVector.indices,
                    values: sparseVector.values
                },
                using: sparseName,
                limit: candidateLimit,
                filter: opts.filter,
                score_threshold: opts.sparseScoreThreshold,
                with_payload: opts.withPayload ?? true,
                with_vector: opts.withVector ?? false
            });
            hasSparse = true;
        }

        if (searches.length === 0) {
            __log.warn(`[QdrantHybridClient] Search called with no valid dense or sparse vectors.`);
            return [];
        }

        __log.debug(`[QdrantHybridClient] hybrid search collection=${collectionName} branches=${searches.length} limit=${limit} denseThreshold=${opts.denseScoreThreshold ?? opts.scoreThreshold}`);
        const batchResults = await this.#connection.getClient().queryBatch(collectionName, { searches });

        let densePoints = [];
        let sparsePoints = [];

        if (hasDense && hasSparse) {
            densePoints = batchResults[0]?.points ?? [];
            sparsePoints = batchResults[1]?.points ?? [];
        } else if (hasDense) {
            densePoints = batchResults[0]?.points ?? [];
        } else {
            sparsePoints = batchResults[0]?.points ?? [];
        }

        const pointMap = new Map();

        densePoints.forEach((p, idx) => {
            pointMap.set(p.id, {
                id: p.id,
                payload: p.payload,
                vector: p.vector,
                denseScore: p.score ?? null,
                denseRank: idx + 1,
                sparseScore: null,
                sparseRank: null
            });
        });

        sparsePoints.forEach((p, idx) => {
            const item = pointMap.get(p.id) || {
                id: p.id,
                payload: p.payload,
                vector: p.vector,
                denseScore: null,
                denseRank: null,
                sparseScore: null,
                sparseRank: null
            };
            item.sparseScore = p.score ?? null;
            item.sparseRank = idx + 1;
            if (!item.payload && p.payload) item.payload = p.payload;
            if (!item.vector && p.vector) item.vector = p.vector;
            pointMap.set(p.id, item);
        });

        const offset = opts.offset ?? 0;
        const mergedPoints = Array.from(pointMap.values()).map(item => {
            const denseRrf = item.denseRank ? (1 / (item.denseRank + 1)) : 0;
            const sparseRrf = item.sparseRank ? (1 / (item.sparseRank + 1)) : 0;
            return {
                ...item,
                score: denseRrf + sparseRrf
            };
        }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(offset, offset + limit);

        __log.debug(`[QdrantHybridClient] hybrid search result count=${mergedPoints.length}`);
        return mergedPoints;
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
        return this.#connection.scroll(collectionName, opts);
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
        return this.#connection.delete(collectionName, opts);
    }

    /**
     * 根据 ID 列表检索 points
     * @param {string} collectionName - 集合名
     * @param {(number|string)[]} ids - ID 列表
     * @param {{ withPayload?: boolean, withVector?: boolean }} [opts] - 选项
     * @returns {Promise<object[]>}
     */
    async retrieve(collectionName, ids, opts = {}) {
        return this.#connection.retrieve(collectionName, ids, opts);
    }

    /**
     * 统计符合条件的 points 数量
     * @param {string} collectionName - 集合名
     * @param {object} [filter] - 过滤条件
     * @returns {Promise<number>}
     */
    async count(collectionName, filter) {
        return this.#connection.count(collectionName, filter);
    }

    /**
     * 批量更新 points
     * @param {string} collectionName - 集合名
     * @param {Array<{ id: number|string, vector?: object, payload?: object }>} points - 点数据列表
     * @returns {Promise<object[]>}
     */
    async update(collectionName, points) {
        return this.upsert(collectionName, points);
    }
}

/** Qdrant 单向量客户端全局单例入口 */
export const qdrantClient = QdrantClient.instance;

/** Qdrant 混合检索客户端全局单例入口 */
export const qdrantHybridClient = QdrantHybridClient.instance;

export default qdrantClient;