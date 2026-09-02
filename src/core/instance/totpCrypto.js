import crypto from 'crypto';

const defaultTOTPOptions = {
    timeStep: 30,
    digits: 6,
    algorithm: 'sha256',
    secret: 'mAou5820.TOTP.secret',
    tolerance: 2
};

/**
 * 基于时间的一次性密码 (TOTP, RFC 6238) 生成与校验器 (单例模式)
 */
class TOTP {
    /** @type {TOTP} 单例实例 */
    static instance = new TOTP();

    /** @type {boolean} 是否已初始化 */
    #initialized = false;

    /** @type {number} 时间步长周期 (秒，默认 30) */
    #timeStep;

    /** @type {number} 动态口令位数 (默认 6) */
    #digits;

    /** @type {string} HMAC 哈希算法 (默认 'sha256') */
    #algorithm;

    /** @type {Buffer} 密钥 Buffer */
    #decodedSecret;

    /** @type {number} 校验容错时间步长窗口数 (默认 2) */
    #tolerance;

    constructor() {
    }

    /**
     * 从全局配置读取 TOTP 参数并完成初始化
     * @returns {this}
     */
    initialize() {
        if (!this.#initialized) {
            const options = __env.get('totp', {});
            const { timeStep, digits, algorithm, secret, tolerance } = options;
            this.#timeStep = timeStep ?? defaultTOTPOptions.timeStep;
            this.#digits = digits ?? defaultTOTPOptions.digits;
            this.#algorithm = algorithm ?? defaultTOTPOptions.algorithm;
            this.#decodedSecret = encodeSecret(secret ?? defaultTOTPOptions.secret);
            this.#tolerance = tolerance ?? defaultTOTPOptions.tolerance;
            this.#initialized = true;
        }
        return this;
    }

    /**
     * 静态生成指定时间戳的 TOTP 动态验证码
     * @param {number} [timestamp_] - 时间戳 (秒)
     * @param {Object} [options={}] - 配置选项
     * @returns {string} 格式化后的数字验证码字符串
     */
    static #generate(timestamp_, options = {}) {
        const timestamp = timestamp_ ?? Math.floor(Date.now() / 1000);

        const timeStep = options.timeStep ?? defaultTOTPOptions.timeStep;
        const digits = options.digits ?? defaultTOTPOptions.digits;
        const decodedSecret = options.decodedSecret ?? encodeSecret(defaultTOTPOptions.secret);

        const counter = Math.floor(timestamp / timeStep);

        const algorithm = options.algorithm ?? defaultTOTPOptions.algorithm;

        const buffer = Buffer.alloc(8);
        buffer.writeBigInt64BE(BigInt(counter));

        const hmac = crypto.createHmac(algorithm, decodedSecret);
        hmac.update(buffer);
        const hmacResult = hmac.digest();

        const offset = hmacResult[hmacResult.length - 1] & 0x0F;
        const truncated = (
            ((hmacResult[offset] & 0x7F) << 24) |
            ((hmacResult[offset + 1] & 0xFF) << 16) |
            ((hmacResult[offset + 2] & 0xFF) << 8) |
            (hmacResult[offset + 3] & 0xFF)
        ) >>> 0;

        return (truncated % (10 ** digits)).toString().padStart(digits, '0');
    }

    /**
     * 静态校验动态验证码（在容错窗口内循环匹配）
     * @param {string} token - 待验证的 TOTP 验证码
     * @param {Object} [options={}] - 校验配置
     * @returns {boolean} 验证通过返回 true
     */
    static #verify(token, options = {}) {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const tolerance = options.tolerance ?? defaultTOTPOptions.tolerance;
        const timeStep = options.timeStep ?? defaultTOTPOptions.timeStep;

        for (let t = currentTimestamp - tolerance * timeStep; t <= currentTimestamp + tolerance * timeStep; t += timeStep) {
            if (TOTP.#generate(t, options) === token) {
                return true;
            }
        }
        return false;
    }

    /**
     * 生成当前时间的 TOTP 动态口令
     * @param {number} [timestamp_] - 可选的指定时间戳 (秒)
     * @returns {string} 动态口令字符串 (如 '123456')
     */
    generate(timestamp_) {
        const timeStep = this.#timeStep;
        const digits = this.#digits;
        const algorithm = this.#algorithm;
        const decodedSecret = this.#decodedSecret;
        const timestamp = timestamp_ ?? Math.floor(Date.now() / 1000);

        return TOTP.#generate(timestamp, { timeStep, digits, algorithm, decodedSecret });
    }

    /**
     * 校验 TOTP 动态口令是否正确有效
     * @param {string} token - 待校验的口令
     * @returns {boolean}
     */
    verify(token) {
        const timeStep = this.#timeStep;
        const digits = this.#digits;
        const algorithm = this.#algorithm;
        const decodedSecret = this.#decodedSecret;
        const tolerance = this.#tolerance;
        return TOTP.#verify(token, { timeStep, digits, algorithm, decodedSecret, tolerance });
    }
}

/**
 * 将密钥字符串转换为 Buffer
 * @param {string} secret - 密钥字符串
 * @returns {Buffer}
 */
function encodeSecret(secret) {
    return Buffer.from(new TextEncoder('utf-8').encode(secret));
}

/** TOTP 动态口令快捷单例操作入口 */
export const totpCrypto = {
    /** 生成当前 TOTP 口令 */
    generate: () => TOTP.instance.initialize().generate(),
    /** 校验 TOTP 口令 */
    verify: token => TOTP.instance.initialize().verify(token)
};