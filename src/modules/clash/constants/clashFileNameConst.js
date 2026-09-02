/**
 * Clash 模块相关文件名与后缀常量定义
 */
export default {
    /** 配置文件后缀 */
    CONFIG_SUFFIX: '.yaml',
    /** 最新合并生成的持久化配置文件名 */
    LATEST_FILE_NAME: 'latest.yaml',
    /** 部署/发布运行的配置文件名 */
    DEPLOYMENT_FILE_NAME: 'config.yaml',
    /** 订阅源缓存文件名 */
    SUBSCRIPTION_FILE_NAME: 'subscription.yaml',
    /** 订阅用量信息缓存文件名 */
    SUBSCRIBE_INFO_FILE_NAME: 'subInfo.txt',
    /** 基础模版配置文件名 */
    CONCAT_BASIC_FILE_NAME: 'basic-conf.yaml',
    /** 前置规则配置文件名 */
    CONCAT_PREFIX_FILE_NAME: 'prefix-conf.yaml',
    /** 本地混入策略组配置文件名 */
    CONCAT_MIXIN_FILE_NAME: 'mixin-conf.yaml',
    // Tailscale 融合配置
    /** Tailscale 代理节点定义文件名 */
    TAILSCALE_PROXY_FILE_NAME: 'proxy-conf.yaml',
    /** Tailscale 规则集文件名 */
    TAILSCALE_RULES_FILE_NAME: 'rules-conf.yaml',
    /** 融合 Tailscale 后的最新完整配置文件名 */
    TAILSCALE_LATEST_FILE_NAME: 'latest-tailscale.yaml'
};