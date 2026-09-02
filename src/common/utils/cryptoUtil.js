import crypto from 'crypto';
import { TinySnowflake } from '../../core/infra/snowflake.js';

/**
 * 根据输入字符串生成确定性 UUID（基于 MD5 散列），若未提供有效输入字符串则生成随机 UUID v4
 * @param {string} [inputString] - 用于生成确定性 UUID 的输入字符串
 * @returns {string} 格式为 xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx 的 UUID 字符串
 */
export function generateUUID(inputString) {
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

/**
 * 根据输入字符串生成指定长度的大写 SHA-256 散列字符串
 * @param {string|number} [inputString="1"] - 输入内容
 * @param {number} [length=40] - 生成字符串截取长度（最大 64）
 * @returns {string} 截取后的大写十六进制散列字符串
 */
export function generateFixedString(inputString, length = 40) {
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

/**
 * 生成唯一的 Snowflake 雪花算法 ID 字符串
 * @returns {string} 雪花 ID 字符串
 */
export function generateSnowflake() {
    return TinySnowflake.instance.generate()
}