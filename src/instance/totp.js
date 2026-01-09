import crypto from 'crypto'

const defaultTOTPOptions = {
    timeStep: 30,
    digits: 6,
    algorithm: 'sha256',
    secret: 'mAou5820.TOTP.secret',
    tolerance: 2
}

export class TOTP {
    #timeStep
    #digits
    #algorithm
    #decodedSecret
    #tolerance
    constructor(options = {}) {
        const { timeStep, digits, algorithm, secret, tolerance } = options
        this.#timeStep = timeStep ?? defaultTOTPOptions.timeStep
        this.#digits = digits ?? defaultTOTPOptions.digits
        this.#algorithm = algorithm ?? defaultTOTPOptions.algorithm
        this.#decodedSecret = encodeSecret(secret ?? defaultTOTPOptions.secret)
        this.#tolerance = tolerance ?? defaultTOTPOptions.tolerance
    }

    static generate(timestamp_, options = {}) {
        const timestamp = timestamp_ ?? Math.floor(Date.now() / 1000);

        const timeStep = options.timeStep ?? defaultTOTPOptions.timeStep;
        const digits = options.digits ?? defaultTOTPOptions.digits;
        const decodedSecret = options.decodedSecret ?? encodeSecret(defaultTOTPOptions.secret);

        const counter = Math.floor(timestamp / timeStep);

        /**
         * NodeJS 环境
         */
        const algorithm = options.algorithm ?? defaultTOTPOptions.algorithm;

        const buffer = Buffer.alloc(8);
        buffer.writeBigInt64BE(BigInt(counter));

        const hmac = crypto.createHmac(algorithm, decodedSecret);
        hmac.update(buffer);
        const hmacResult = hmac.digest();

        /**
         * 浏览器 环境
         */
        // const algorithm = { name: 'HMAC', hash: 'SHA-256' };
        // const counterBuffer = new ArrayBuffer(8);
        // const view = new DataView(counterBuffer);
        // view.setBigUint64(0, BigInt(counter), false);
        // const key = await window.crypto.subtle.importKey(
        //     'raw',
        //     decodedSecret,
        //     algorithm,
        //     false,
        //     ['sign']
        // );
        // let hmacResult = await window.crypto.subtle.sign(
        //     algorithm.name,
        //     key,
        //     counterBuffer
        // );
        // hmacResult = new Uint8Array(hmacResult);

        const offset = hmacResult[hmacResult.length - 1] & 0x0F;
        const truncated = (
            ((hmacResult[offset] & 0x7F) << 24) |
            ((hmacResult[offset + 1] & 0xFF) << 16) |
            ((hmacResult[offset + 2] & 0xFF) << 8) |
            (hmacResult[offset + 3] & 0xFF)
        ) >>> 0;

        return (truncated % (10 ** digits)).toString().padStart(digits, '0');
    }

    static verify(token, options = {}) {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const tolerance = options.tolerance ?? defaultTOTPOptions.tolerance;
        const timeStep = options.timeStep ?? defaultTOTPOptions.timeStep;

        for (let t = currentTimestamp - tolerance * timeStep; t <= currentTimestamp + tolerance * timeStep; t++) {
            const generate = TOTP.generate(t, options)
            console.log(generate, token, generate === token)
            if (generate === token) {
                return true;
            }
        }
        return false;
    }

    generate(timestamp_) {
        const timeStep = this.#timeStep;
        const digits = this.#digits;
        const algorithm = this.#algorithm;
        const decodedSecret = this.#decodedSecret;
        const timestamp = timestamp_ ?? Math.floor(Date.now() / 1000);

        return TOTP.generate(timestamp, { timeStep, digits, algorithm, decodedSecret })
    }

    verify(token) {
        const timeStep = this.#timeStep;
        const digits = this.#digits;
        const algorithm = this.#algorithm;
        const decodedSecret = this.#decodedSecret;
        const tolerance = this.#tolerance;
        return TOTP.verify(token, { timeStep, digits, algorithm, decodedSecret, tolerance })
    }
}

function encodeSecret(secret) {
    return Buffer.from(new TextEncoder('utf-8').encode(secret))
}