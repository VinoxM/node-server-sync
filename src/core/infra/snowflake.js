export class TinySnowflake {
    static instance = new TinySnowflake()
    constructor() {
        // 项目起始时间戳 (2026-01-01)
        this.twepoch = 1767225600000n;
        this.lastTimestamp = -1n;
        this.sequence = 0n;

        // 最大序列号 (2^12 - 1 = 4095)
        this.maxSequence = 4095n;
    }

    #now() {
        return BigInt(Date.now());
    }

    generate() {
        let timestamp = this.#now();

        if (timestamp < this.lastTimestamp) {
            throw new Error("时钟回拨，生成失败");
        }

        if (timestamp === this.lastTimestamp) {
            // 同一毫秒内，累加序列号
            this.sequence = (this.sequence + 1n) & this.maxSequence;
            if (this.sequence === 0n) {
                // 序列号溢出，等待下一毫秒
                while (timestamp <= this.lastTimestamp) {
                    timestamp = this.#now();
                }
            }
        } else {
            // 不同毫秒，重置序列号
            this.sequence = 0n;
        }

        this.lastTimestamp = timestamp;

        // 位移拼接：时间戳左移 12 位 | 序列号
        // (41位时间戳) + (12位序列号) = 53位
        const id = ((timestamp - this.twepoch) << 12n) | this.sequence;
        return Number(id);
    }
}