import { ContextSubscribe } from "../context/subscribe.js";
import { QdrantClient as QdrantApiClient } from '@qdrant/js-client-rest';
import { embedTransformer } from "./transformer.js";

class QdrantClient extends ContextSubscribe {
    static instance = new QdrantClient()
    static DIMENSION = 1024;

    /** @type {QdrantApiClient | null} */
    #client = null;

    constructor() {
        super("QdrantClient", () => this.#init(true), true)
    }

    /** @returns {QdrantApiClient} */
    #getClient() {
        this.#init();
        if (!this.#client) throw new Error('QdrantClient not initialized');
        return this.#client;
    }

    #clean() {
        this.#client = null;
    }

    #init(force = false) {
        this.doSubscribe();
        if (this.#client !== null && !force) return;
        this.#clean();
        const opts = __env.get('qdrant.client')
        if (!opts) return;
        this.#client = new QdrantApiClient({
            host: opts.host,
            port: opts.port,
            https: parseInt(opts.port) === 443,
            apiKey: opts.apiKey
        })
    }

    // ─── Embedding ───────────────────────────────────────────────

    /**
     * 将文本转换为 1024 维语义向量
     * @param {string} text
     * @returns {Promise<number[]>}
     */
    async embed(text) {
        return embedTransformer.extract(text);
    }

    /**
     * 将文本列表批量转换为向量
     * @param {string[]} texts
     * @returns {Promise<number[][]>}
     */
    async embedBatch(texts) {
        return Promise.all(texts.map(t => this.embed(t)));
    }

    /**
     * 将 payload 中指定字段提取并转为向量，返回 [vector, payload]
     * @param {object} payload
     * @param {string} [textField] - 用于生成向量的文本字段，默认 'text'
     * @returns {Promise<[number[], object]>}
     */
    async embedPayload(payload, textField = 'text') {
        const text = payload[textField];
        if (!text) throw new Error(`Payload missing text field: "${textField}"`);
        const vector = await this.embed(text);
        return [vector, payload];
    }

    // ─── Collection ──────────────────────────────────────────────

    /**
     * 确保集合存在（不存在则自动创建）
     * @param {string} name
     * @param {object} [extraOpts]
     * @returns {Promise<boolean>} true=已存在, false=新建
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
     * @param {string} name
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
     * 获取集合信息
     * @param {string} name
     * @returns {Promise<object>}
     */
    async getCollectionInfo(name) {
        const result = await this.#getClient().getCollection(name);
        __log.debug(`[QdrantClient] getCollectionInfo name=${name}`, result);
        return result;
    }

    /**
     * 列出所有集合
     * @returns {Promise<string[]>}
     */
    async listCollections() {
        const result = await this.#getClient().listCollections();
        __log.debug(`[QdrantClient] listCollections count=${result.collections.length}`);
        return result.collections.map(c => c.name);
    }

    /**
     * 删除集合
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    async deleteCollection(name) {
        __log.info(`[QdrantClient] deleteCollection name=${name}`);
        await this.#getClient().deleteCollection(name);
        return true;
    }

    /**
     * 创建 payload 字段索引，加速 filter 查询
     * @param {string} collectionName
     * @param {string} fieldName - 字段名
     * @param {"keyword"|"integer"|"float"|"geo"|"text"|"bool"|"datetime"|"uuid"|object} [fieldSchema="keyword"] - 索引类型或带参 schema
     * @param {{ wait?: boolean, timeout?: number }} [opts]
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

    // ─── Batch config ────────────────────────────────────────────

    /** 单次 upsert 最大 point 数，防止请求 body 超限（nginx 默认 1MB） */
    static UPSERT_BATCH_SIZE = 100;

    // ─── Upsert ──────────────────────────────────────────────────

    /**
     * 写入/更新 points（自动分批，防止请求体过大）
     * @param {string} collectionName
     * @param {Array<{ id: number|string, vector?: number[], payload?: object }>} points
     * @param {{ wait?: boolean, batchSize?: number }} [opts]
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
     * 写入带 payload 的 point，自动从指定字段生成向量
     * @param {string} collectionName
     * @param {{ id: number|string, payload: object, textField?: string }} item
     * @param {{ wait?: boolean }} [opts]
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
     * 批量写入带 payload 的 points，自动从指定字段生成向量。
     * - 模型推理串行执行（最多1个并发），避免服务器卡死
     * - upsert 自动分批，防止请求体过大
     * @param {string} collectionName
     * @param {Array<{ id: number|string, payload: object, textField?: string }>} items
     * @param {{ wait?: boolean }} [opts]
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
     * 语义搜索
     * @param {string} collectionName
     * @param {string|number[]} query - 文本（自动转向量）或原始向量
     * @param {{
     *   limit?: number,
     *   offset?: number,
     *   filter?: object,
     *   withPayload?: boolean,
     *   withVector?: boolean,
     *   scoreThreshold?: number,
     * }} [opts]
     * @returns {Promise<object[]>}
     */
    async search(collectionName, query, opts = {}) {
        const vector = Array.isArray(query) ? query : await this.embed(query);
        __log.debug(`[QdrantClient] search collection=${collectionName} limit=${opts.limit ?? 10} threshold=${opts.scoreThreshold}`);
        const result = await this.#getClient().search(collectionName, {
            vector,
            limit: opts.limit ?? 10,
            offset: opts.offset,
            filter: opts.filter,
            with_payload: opts.withPayload ?? true,
            with_vector: opts.withVector ?? false,
            score_threshold: opts.scoreThreshold,
        });
        __log.debug(`[QdrantClient] search result count=${result.length}`);
        return result;
    }

    /**
     * 分页遍历 points
     * @param {string} collectionName
     * @param {{
     *   filter?: object,
     *   limit?: number,
     *   offset?: number,
     *   withPayload?: boolean,
     *   withVector?: boolean,
     * }} [opts]
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
     * 通过 ID 或 filter 删除 points
     * @param {string} collectionName
     * @param {{
     *   ids?: (number|string)[],
     *   filter?: object,
     *   wait?: boolean,
     * }} opts
     * @returns {Promise<object>}
     */
    async delete(collectionName, opts = {}) {
        const idCount = opts.ids?.length ?? 0;
        __log.info(`[QdrantClient] delete collection=${collectionName} ids=${idCount} filter=${!!opts.filter}`);
        const result = await this.#getClient().delete(collectionName, {
            wait: true,
            points: opts.ids ? opts.ids.map(id => ({ id })) : undefined,
            filter: opts.filter,
            ...opts,
        });
        return result;
    }

    /**
     * 根据 ID 检索 points
     * @param {string} collectionName
     * @param {(number|string)[]} ids
     * @param {{ withPayload?: boolean, withVector?: boolean }} [opts]
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
     * 统计 points 数量
     * @param {string} collectionName
     * @param {object} [filter]
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
     * 批量更新 points（替换 payload 和 vector）
     * @param {string} collectionName
     * @param {Array<{ id: number|string, vector?: number[], payload?: object }>} points
     * @returns {Promise<object[]>}
     */
    async update(collectionName, points) {
        return this.upsert(collectionName, points);
    }
}

export const qdrantClient = QdrantClient.instance;