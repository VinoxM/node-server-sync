import crypto from 'crypto'
import { getDefaultSecret } from './configUtil.js';

export const generateUUID = (inputString) => {
    if (inputString === undefined || inputString === null || typeof inputString !== 'string' || inputString.trim().length === 0) {
        return crypto.randomUUID().toString();
    }
    const md5Hash = crypto.createHash("md5");
    md5Hash.update(inputString);
    const hash = md5Hash.digest("hex");
    return hash.substring(0, 8) +
        "-" +
        hash.substring(8, 12) +
        "-" +
        "4" +
        hash.substring(13, 16) +
        "-" +
        "a" +
        hash.substring(17, 20) +
        "-" +
        hash.substring(20, 32);
};

export const generateFixedString = (inputString, length = 40) => {
    if (!inputString) {
        inputString = "1";
    }
    inputString = inputString.toString();
    if (length > 64) {
        length = 64;
    }
    const sha256Hash = crypto.createHash("sha256");
    sha256Hash.update(inputString);
    const hash = sha256Hash.digest("hex").toUpperCase();
    return hash.substring(0, length);
};

export const createSha256Hash = (inputString, salt) => {
    if (isBlank(inputString)) {
        return inputString
    }
    if (isBlank(salt)) {
        salt = getDefaultSecret()
    }
    salt = Buffer.from(salt, 'utf-8').toString('hex');
    const sha256Hash = crypto.createHash("sha256");
    sha256Hash.update(inputString + salt);
    return sha256Hash.digest("hex");
}