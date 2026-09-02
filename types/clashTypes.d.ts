/**
 * Clash 节点代理项配置
 */
export interface ClashProxy {
  name: string;
  type: string;
  server: string;
  port: number;
  [key: string]: any;
}

/**
 * Clash 策略组配置
 */
export interface ClashProxyGroup {
  name: string;
  type: 'select' | 'url-test' | 'fallback' | 'load-balance' | 'relay';
  proxies: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
  lazy?: boolean;
  [key: string]: any;
}

/**
 * Clash 外部规则集提供者配置
 */
export interface ClashRuleProvider {
  type: 'http' | 'file';
  behavior: 'domain' | 'ipcidr' | 'classical';
  path: string;
  url?: string;
  interval?: number;
  [key: string]: any;
}

/**
 * Clash YAML 整体配置结构
 */
export interface ClashConfig {
  port?: number;
  'socks-port'?: number;
  'redir-port'?: number;
  'tproxy-port'?: number;
  'mixed-port'?: number;
  'allow-lan'?: boolean;
  mode?: 'rule' | 'global' | 'direct';
  'log-level'?: 'info' | 'warning' | 'error' | 'debug' | 'silent';
  'external-controller'?: string;
  secret?: string;
  proxies: ClashProxy[];
  'proxy-groups': ClashProxyGroup[];
  rules: string[];
  'rule-providers'?: Record<string, ClashRuleProvider>;
  [key: string]: any;
}

/**
 * Clash 订阅源配置项
 */
export interface ClashSubscriptionSource {
  /** 订阅源别名标识 */
  label: string;
  /** 远程订阅 URL */
  url: string;
  /** 是否为默认主订阅源 (会解析用户用量信息) */
  isDefault?: boolean;
}

/**
 * 解析后的订阅源对象
 */
export interface ClashSubscriptionSourceObj {
  label: string;
  obj: ClashConfig;
}

/**
 * 订阅拉取统计结果
 */
export interface ClashSubscriptionResult {
  /** 成功更新的源数量 */
  success: number;
  /** 跳过的源数量 */
  skipped: number;
  /** 失败的源数量 */
  failed: number;
}

/**
 * 读取 Clash 配置文件结果
 */
export interface ClashFileContentResult {
  headers: Record<string, string>;
  content: string | null;
}
