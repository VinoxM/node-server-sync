/**
 * 轻量级 53 位 JavaScript 安全整数雪花算法 ID 生成器
 * 生成的 ID 最大占用 53 位（41 位相对时间戳 + 12 位自增序列号），可安全转为 JavaScript Number 类型而不会丢失精度
 */
export class TinySnowflake {
    /** @type {TinySnowflake} 全局单例实例 */
    static instance = new TinySnowflake();

    constructor() {
        /** @type {bigint} 项目起始基准纪元时间戳 (2026-01-01 00:00:00 UTC) */
        this.twepoch = 1767225600000n;

        /** @type {bigint} 上次生成 ID 的时间戳 */
        this.lastTimestamp = -1n;

        /** @type {bigint} 毫秒内自增序列号 */
        this.sequence = 0n;

        /** @type {bigint} 毫秒内最大序列号 (2^12 - 1 = 4095) */
        this.maxSequence = 4095n;
    }

    /**
     * 获取当前时间戳 BigInt 形式
     * @returns {bigint}
     */
    #now() {
        return BigInt(Date.now());
    }

    /**
     * 生成下一个全局唯一 53 位雪花 ID
     * @returns {number} 唯一 ID (安全安全整数)
     * @throws {Error} 当检测到系统时钟回拨时抛出异常
     */
    generate() {
        let timestamp = this.#now();

        if (timestamp < this.lastTimestamp) {
            throw new Error("时钟回拨，生成失败");
        }

        if (timestamp === this.lastTimestamp) {
            // 同一毫秒内，累加序列号
            this.sequence = (this.sequence + 1n) & this.maxSequence;
            if (this.sequence === 0n) {
                // 序列号溢出，阻塞自旋等待下一毫秒
                while (timestamp <= this.lastTimestamp) {
                    timestamp = this.#now();
                }
            }
        } else {
            // 进入新的毫秒，重置序列号
            this.sequence = 0n;
        }

        this.lastTimestamp = timestamp;

        // 位移拼接：(时间戳差值 << 12位) | 序列号
        // 41位时间戳 + 12位序列号 = 53位 (符合 Number.MAX_SAFE_INTEGER 限制)
        const id = ((timestamp - this.twepoch) << 12n) | this.sequence;
        return Number(id);
    }
}