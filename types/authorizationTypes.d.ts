/**
 * 授权用户信息载荷
 */
export interface UserInfo {
  /** 用户唯一 ID */
  id: number;
  /** 用户名 */
  uname?: string;
  /** 客户端应用标识 ID */
  clientId: string;
  [key: string]: any;
}

/**
 * 客户端应用配置项
 */
export interface AuthClientConfig {
  /** 客户端标识 ID */
  id: string;
  /** 客户端通信密钥 (Base64) */
  secret: string;
  /** 单客户端允许的最大并发 Token 存储数 */
  maxTokenStore?: number;
}

/**
 * 授权与认证全局配置
 */
export interface AuthOptionConfig {
  /** 默认最大 Token 存储数 */
  maxTokenStore?: number;
  /** 默认 Token 过期时间 (如 '30d') */
  defaultTokenExpire?: string | number;
  /** JWT 签名私钥 */
  secretKey?: string;
  /** 允许接入的客户端列表 */
  allowedClients?: AuthClientConfig[];
}