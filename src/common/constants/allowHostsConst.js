/**
 * 允许访问的 Host 域名白名单列表 (支持通配符)
 * @type {string[]}
 */
export const allowLanHosts = [
    'server.vinoxm.top',
    '*-coder.vinoxm.top'
];

/**
 * 允许访问的局域网与内网 CIDR IP 段白名单列表
 * @type {string[]}
 */
export const allowLanCIDR = [
    // '10.0.0.0/8',
    '192.168.31.0/24',
    '172.16.0.0/12',
    '127.0.0.1',
    '100.64.0.0/10'
];