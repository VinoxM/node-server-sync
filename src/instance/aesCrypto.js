import crypto from 'crypto'

export class AESCrypto {
    #key;
    #iv;
    #algorithm;
    constructor(key, iv, algorithm = 'aes-128-cbc') {
        this.#algorithm = algorithm
        this.#initKey(key)
        this.#initIv(iv)
    }

    #initKey(key) {
        if (typeof key !== 'string') {
            throw new Error('Key must be a string')
        }
        const keyLengthMap = {
            'aes-128-cbc': 16,
            'aes-192-cbc': 24,
            'aes-256-cbc': 32
        };

        const requiredLength = keyLengthMap[this.#algorithm] || 32;

        let keyBytes = Buffer.from(key)
        if (keyBytes.length < requiredLength) {
            keyBytes = crypto.createHash('sha256').update(key).digest().subarray(0, requiredLength);
        } else if (keyBytes.length > requiredLength) {
            keyBytes = keyBytes.subarray(0, requiredLength);
        }

        this.#key = keyBytes
    }

    #initIv(iv) {
        if (typeof iv !== 'string') {
            throw new Error('IV must be a string');
        }

        let ivBuffer = Buffer.from(iv)
        let ivBytes = ivBuffer

        if (ivBuffer.length < 16) {
            const paddedIV = Buffer.alloc(16)
            ivBuffer.copy(paddedIV)
            ivBytes = paddedIV
        } else if (ivBuffer.length > 16) {
            ivBytes = ivBuffer.subarray(0, 16)
        }

        this.#iv = ivBytes
    }

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

    static encrypt(plainText) {
        return getDefaultAESCrypto().encrypt(plainText)
    }

    static decrypt(encryptedText) {
        return getDefaultAESCrypto().decrypt(encryptedText)
    }
}

let defaultAESCrypto = null

const getAESKey = () => __env.get('crypto.aes.key')

const getAESIv = () => __env.get('crypto.aes.iv')

const getDefaultAESCrypto = () => {
    if (defaultAESCrypto === null) {
        defaultAESCrypto = new AESCrypto(getAESKey(), getAESIv())
    }
    return defaultAESCrypto
}