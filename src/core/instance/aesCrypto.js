import crypto from 'crypto';

/**
 * AES 对称加解密工具类 (单例模式)
 */
class AESCrypto {
    /** @type {AESCrypto} 单例实例 */
    static instance = new AESCrypto();

    /** @type {Buffer} 密钥 Buffer */
    #key;

    /** @type {Buffer} 初始化向量 IV Buffer */
    #iv;

    /** @type {string} 加密算法名称 (如 'aes-128-cbc') */
    #algorithm;

    /** @type {boolean} 是否已完成初始化 */
    #initialized = false;

    /**
     * @param {string} [algorithm='aes-128-cbc'] - 加密算法名称
     */
    constructor(algorithm = 'aes-128-cbc') {
        this.#algorithm = algorithm;
    }

    /**
     * 从全局环境配置读取 key 与 iv 并完成初始化
     * @returns {this}
     */
    initialize() {
        if (!this.#initialized) {
            const key = __env.get('crypto.aes.key');
            const iv = __env.get('crypto.aes.iv');
            this.#initKey(key);
            this.#initIv(iv);
            this.#initialized = true;
        }
        return this;
    }

    /**
     * 标准化并初始化 Key
     * @param {string} key - 原始密钥字符串
     */
    #initKey(key) {
        if (typeof key !== 'string') {
            throw new Error('Key must be a string');
        }
        const keyLengthMap = {
            'aes-128-cbc': 16,
            'aes-192-cbc': 24,
            'aes-256-cbc': 32
        };

        const requiredLength = keyLengthMap[this.#algorithm] || 32;

        let keyBytes = Buffer.from(key);
        if (keyBytes.length < requiredLength) {
            keyBytes = crypto.createHash('sha256').update(key).digest().subarray(0, requiredLength);
        } else if (keyBytes.length > requiredLength) {
            keyBytes = keyBytes.subarray(0, requiredLength);
        }

        this.#key = keyBytes;
    }

    /**
     * 标准化并初始化 IV
     * @param {string} iv - 原始 IV 字符串
     */
    #initIv(iv) {
        if (typeof iv !== 'string') {
            throw new Error('IV must be a string');
        }

        let ivBuffer = Buffer.from(iv);
        let ivBytes = ivBuffer;

        if (ivBuffer.length < 16) {
            const paddedIV = Buffer.alloc(16);
            ivBuffer.copy(paddedIV);
            ivBytes = paddedIV;
        } else if (ivBuffer.length > 16) {
            ivBytes = ivBuffer.subarray(0, 16);
        }

        this.#iv = ivBytes;
    }

    /**
     * 对明文字符串进行 AES 加密，返回 Base64 编码密文
     * @param {string} plainText - 明文字符串
     * @returns {string} Base64 编码密文
     */
    encrypt(plainText) {
        try {
            const cipher = crypto.createCipheriv(this.#algorithm, this.#key, this.#iv);

            let encrypted = cipher.update(plainText, 'utf8', 'base64');
            encrypted += cipher.final('base64');

            return encrypted;
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * 对 Base64 编码密文进行 AES 解密，返回 UTF-8 明文字符串
     * @param {string} encryptedText - Base64 编码密文
     * @returns {string} UTF-8 明文字符串
     */
    decrypt(encryptedText) {
        try {
            const decipher = crypto.createDecipheriv(this.#algorithm, this.#key, this.#iv);

            let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }
}

/** AES 加解密快捷单例入口 */
export const aesCrypto = {
    /**
     * AES 加密
     * @param {string} plainText - 明文
     * @returns {string} 密文
     */
    encrypt: plainText => AESCrypto.instance.initialize().encrypt(plainText),
    /**
     * AES 解密
     * @param {string} encryptedText - 密文
     * @returns {string} 明文
     */
    decrypt: encryptedText => AESCrypto.instance.initialize().decrypt(encryptedText)
};