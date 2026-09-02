import type { Request } from 'express';
import type { SocketClient } from '../src/core/infra/socketClient.js';
import type { SSEClient } from '../src/core/infra/sseClient.js';
import type { FilterExecuter } from './filterTypes.d.ts';
import type { ApiRouteModule } from './routeTypes.d.ts';

/**
 * WebSocket 频道路由模块配置
 */
export interface SocketChannelConfig {
  /** 频道唯一标识名称 (对应 URL 路径 `/channel/:channel`) */
  channel: string;
  /** 是否禁用当前频道 */
  disabled?: boolean;
  /** TOTP 动态签名秘钥 (支持固定字符串或布尔值) */
  secret?: string | boolean;
  /** 是否在控制台打印消息日志 */
  printMessage?: boolean;
  /** 客户端连接前置自定义校验函数 (IP、参数等) */
  validation?: (realIp: string, searchParams: URLSearchParams) => boolean;
  /** 客户端成功建立连接后的回调 (可在此进行身份绑定、下发首屏数据) */
  onConnect?: (client: SocketClient, searchParams: URLSearchParams) => void | Promise<void>;
  /** 收到客户端发送消息时的回调处理 */
  onMessage?: (data: any, client: SocketClient) => void | Promise<void>;
}

/**
 * SSE 频道路由模块配置
 */
export interface SSEChannelConfig {
  /** SSE 频道唯一标识名称 (对应 URL 查询参数 `?channel=:channel`) */
  channel: string;
  /** 客户端连接权限验证函数 (必须返回 true 才允许建立连接) */
  validator: (req: Request, clients: Record<string, SSEClient[]>) => boolean;
  /** 客户端成功建立长连接后的回调 (可下发欢迎语或快照数据) */
  onConnected?: (client: SSEClient, query: any) => void;
  /** 环境变量/全局配置热刷新时的联动通知回调 */
  onConfigurationRefreshed?: (client: SSEClient) => void;
  /** 广播事件写入过滤判定函数 (返回 true 才允许向该客户端推送当前消息) */
  canWrite?: (query: any, opts: any, client: SSEClient) => boolean;
  /** 客户端断开连接时的清理回调 */
  onDisconnected?: (client: SSEClient) => void;
}

/**
 * API 服务启动选项
 */
export interface ServerStartOptions {
  /** 额外注入的自定义过滤器列表 */
  apiFilters?: Array<FilterExecuter>;
  /** 额外注入的自定义路由配置 */
  apiMapping?: Array<ApiRouteModule>;
}
