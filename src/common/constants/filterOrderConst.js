/**
 * API 过滤器顺序常量定义
 */
export const API_FILTER_ORDER = Object.freeze({
    API_DISABLED: -200,
    ALLOW_HOSTS: -120,
    IP_DISBALED: -110,
    TOKEN_BUCKET: -100,
    CONTENT_TYPE: -90,
    NEED_SECRET: -80,
    AUTHORIZATION: -79,
    AWAIT_RSS_UPDATING: -70,
    REQUEST_BODY: -60,
    PRE_CHECK: -50,
    PRE_HANDLE: -49
});