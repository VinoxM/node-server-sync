function isNotBlank(str) {
    return str !== null && str !== undefined && ("" + str).trim() !== "";
}

function padStart(str, maxLength = 2, fillString = '0') {
    return (str + "").padStart(maxLength, fillString);
}

/**
 * 格式化日期对象为指定模板字符串
 * @param {Date} d - 日期对象
 * @param {string} [formatStr="yyyy-MM-dd HH:mm:ss.ms"] - 格式化模板（支持 yyyy, MM, dd, HH, mm, ss, ms）
 * @param {boolean} [is30Hours=false] - 是否启用 30 小时制（常用于日本动画深夜档，凌晨 6 点前算作前一天的 24~29 点）
 * @returns {string} 格式化后的日期时间字符串
 */
export function dateFormat(d, formatStr, is30Hours = false) {
    const flag = is30Hours && d.getHours() < 6
    const date = flag ? new Date(d.setDate(d.getDate() - 1)) : d;
    const year = date.getFullYear();
    const month = padStart(date.getMonth() + 1);
    const day = padStart(date.getDate());
    const hours = padStart(flag ? (date.getHours() + 24) : date.getHours());
    const minutes = padStart(date.getMinutes());
    const seconds = padStart(date.getSeconds());
    const millSeconds = padStart(date.getMilliseconds(), 3);
    let format = isNotBlank(formatStr) ? formatStr : "yyyy-MM-dd HH:mm:ss.ms";
    return format.replace("yyyy", year)
        .replace("MM", month)
        .replace("dd", day)
        .replace("HH", hours)
        .replace("mm", minutes)
        .replace("ss", seconds)
        .replace("ms", millSeconds);
}

/**
 * 获取当前动画季度
 * @returns {[string, string]} 季度数组 [年份, 月份]，月份为 '01', '04', '07', '10' 之一
 */
export function getCurSeason() {
    let now = new Date();
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    let month = now.getMonth() + 1;
    month = (Math.ceil(month / 3) - 1) * 3 + 1;
    return [now.getFullYear() + '', String(month).padStart(2, '0')];
}

/**
 * 获取指定季度（或当前季度）的下一个动画季度
 * @param {[string, string]} [season] - 当前基准季度 [年份, 月份]，缺省时以当前季度为基准
 * @returns {[string, string]} 下一个季度数组 [年份, 月份]
 */
export function getNextSeason(season) {
    const toSeason = season ?? getCurSeason();
    const [year, month] = toSeason;
    const date = new Date(`${year}-${month}-01`);
    date.setMonth(date.getMonth() + 3);
    return [date.getFullYear() + '', String(date.getMonth() + 1).padStart(2, '0')];
}

/**
 * 将日期转换为数据库标准的格式 (yyyy-MM-dd HH:mm:ss)
 * @param {string|number|Date} dateStr - 输入的日期表达式
 * @returns {string} 标准数据库日期时间字符串
 */
export function dateFormatForDB(dateStr) {
    const date = new Date(dateStr);
    return dateFormat(date, "yyyy-MM-dd HH:mm:ss");
}

/**
 * 将日期转换为 30 小时制广播格式 (yyyy-MM-dd HH:mm:ss)
 * @param {string|number|Date} dateStr - 输入的日期表达式
 * @returns {string} 30 小时制日期时间字符串
 */
export function dateFormatFor30Hours(dateStr) {
    let date = new Date(dateStr);
    return dateFormat(date, "yyyy-MM-dd HH:mm:ss", true);
}

/**
 * 将日期转换为日志输出的标准格式 (yyyy/MM/dd HH:mm:ss.ms)
 * @param {string|number|Date} [d] - 输入日期，缺省为当前时间
 * @returns {string} 日志格式时间字符串
 */
export function dateFormatForLog(d) {
    const date = d ? new Date(d) : new Date();
    return dateFormat(date, "yyyy/MM/dd HH:mm:ss.ms");
}

/**
 * 判断传入的季度字符串是否为当前动画季度
 * @param {string} season - 格式如 '2024-04' 的季度字符串
 * @returns {boolean} 是否为当前季度
 */
export function isCurSeason(season) {
    const curSeasons = getCurSeason();
    return season === curSeasons.join('-');
}