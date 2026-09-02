/**
 * 将字节大小格式化为易读的容量描述字符串 (如 "1.25 MB", "500 KB")
 * @param {number|string|bigint} bytes - 字节大小
 * @param {number} [decimals=2] - 小数点后保留位数
 * @returns {string} 格式化后的描述字符串
 */
export function formatFileSize(bytes, decimals = 2) {
    if (bytes === null || bytes === undefined) return '-';
    if (bytes === 0 || bytes === '0') return '0 B';

    // 将输入转换为 BigInt 处理，防止溢出
    if (typeof bytes === 'string') {
        bytes = bytes.split('.')[0]
    }
    if (typeof bytes === 'number') {
        bytes = Math.trunc(bytes)
    }
    const b = BigInt(bytes);
    if (b < 0n) return 'Invalid Size';

    const k = 1024n;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    // 计算当前的单位索引
    // 数学原理：i = floor(log1024(bytes))
    let i = 0;
    let tempB = b;
    while (tempB >= k && i < sizes.length - 1) {
        tempB /= k;
        i++;
    }

    // 为了保留小数，我们需要将 BigInt 转回 Number 进行浮点运算
    // 对于显示而言，Number 的精度（53位）足够表示转换后的数值
    const result = Number(b) / Math.pow(1024, i);

    return `${parseFloat(result.toFixed(dm))} ${sizes[i]}`;
}

/**
 * 将毫秒数转换为易读的时间持续时长描述字符串 (如 "2d3h4m5s", "500ms")
 * @param {number} ms - 需转换的毫秒数
 * @returns {string} 格式化后的时间描述字符串
 */
export function formatDuration(ms) {
    // 基础边界判断
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return '0s';
    if (ms < 1000) return `${Math.floor(ms)}ms`;

    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join('') || '0s';
}