/**
 * 允许访问的 Host 域名白名单列表 (支持通配符)
 * @type {string[]}
 */
export const allowLanHosts = [
    'server.vinoxm.art',
    '*-coder.vinoxm.cloud'
];

/**
 * 允许访问的局域网与内网 CIDR IP 段白名单列表
 * @type {string[]}
 */
export const allowLanCIDR = [
    '192.168.31.0/24',
    '172.17.0.0/24',
    '127.0.0.1'
];