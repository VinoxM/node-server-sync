import type { Request, Response } from "express";
import type { UserInfo } from './authorizationTypes';

/**
 * API 统一请求对象（扩展自 Express.Request，包含 userInfo 鉴权载荷）
 */
interface ApiRequest extends Request {
  userInfo?: UserInfo;
  [key: string]: any;
}

/**
 * API 统一响应对象（扩展自 Express.Response）
 */
interface ApiResponse extends Response {
  /** 是否已自定义管道处理过 */
  __customPiped?: boolean;
  [key: string]: any;
}

export interface ApiRouteConfig {
  /** HTTP 请求方法，如 GET / POST / ALL */
  method: 'get' | 'post' | 'all';
  /** 接口前置参数/条件校验 */
  preCheck?: (req: ApiRequest) => any;
  /** 接口前置数据解密/预处理 */
  preHandle?: (req: ApiRequest) => any;
  /** 核心业务处理回调 */
  callback: (req: ApiRequest, res: ApiResponse) => any | Promise<any>;
  /** 是否需要鉴权验证 */
  needAuth?: boolean;
  /** 请求通信签名/秘钥（支持固定值或动态函数） */
  needSecret?: string | (() => string);
  /** 是否忽略通信秘钥验证 */
  ignoreSecret?: boolean;
  /** 允许访问的主机/IP 列表 */
  allowHosts?: string[] | (() => string[]);
  /** 是否禁用该路由 */
  disabled?: boolean;
  /** 是否忽略访问日志打印 */
  ignoreAccessPrint?: boolean;
  /** 是否忽略返回体包装 */
  ignoreReturn?: boolean;
  /** 是否忽略返回日志打印 */
  ignoreReturnPrint?: boolean;
  /** 是否在返回日志中打印响应体 */
  printResponse?: boolean;
  /** 是否使用正则匹配路径 */
  pathRegex?: boolean;
  /** 是否可能是流式响应 (如 SSE) */
  maybeStream?: boolean;
  /** 是否忽略全链路追踪 Trace */
  ignoreTrace?: boolean;
}

export type ApiRouteModule = {
  /** 路由基础前缀 */
  basePath?: string;
} & {
  /** 路由路径配置映射 */
  [path: `/${string}`]: ApiRouteConfig;
};  