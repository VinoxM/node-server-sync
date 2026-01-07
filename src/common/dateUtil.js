function padStart(str, maxLength = 2, fillString = '0') {
    return (str + "").padStart(maxLength, fillString);
}

function dateFormat(d, formatStr, is30Hours = false) {
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

const getCurSeason = () => {
    let now = new Date();
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    let month = now.getMonth() + 1;
    month = (Math.ceil(month / 3) - 1) * 3 + 1;
    return [now.getFullYear() + '', String(month).padStart(2, '0')];
}

export function dateFormatForDB(dateStr) {
    const date = new Date(dateStr);
    return dateFormat(date, "yyyy-MM-dd HH:mm:ss");
}

export function dateFormatFor30Hours(dateStr) {
    let date = new Date(dateStr);
    return dateFormat(date, "yyyy-MM-dd HH:mm:ss", true);
}

export function dateFormatForLog(d) {
    const date = d ? new Date(d) : new Date();
    return dateFormat(date, "yyyy/MM/dd HH:mm:ss.ms");
}

export function isCurSeason(season) {
    const curSeasons = getCurSeason();
    return season === curSeasons.join('-');
}