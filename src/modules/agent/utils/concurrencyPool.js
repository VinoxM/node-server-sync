/**
 * 带有并发数量限制的异步任务并发映射池
 * @template T, R
 * @param {T[]} items - 待处理的数据数组
 * @param {number} limit - 最大并发数量
 * @param {(item: T, index: number) => Promise<R>} fn - 异步映射处理函数
 * @returns {Promise<R[]>} 处理结果数组（与原始数组下标严格对应）
 */
export async function mapConcurrent(items, limit, fn) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const concurrency = Math.max(1, Math.min(limit || 1, items.length));
    const results = new Array(items.length);
    let index = 0;

    const worker = async () => {
        while (index < items.length) {
            const currentIndex = index++;
            results[currentIndex] = await fn(items[currentIndex], currentIndex);
        }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    return results;
}
