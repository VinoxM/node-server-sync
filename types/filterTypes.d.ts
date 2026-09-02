import type { Request, Response } from "express";
import type { ApiRouteConfig } from "./routeTypes.d.ts";

export interface FilterContext {
    req: Request & { userInfo?: any;[key: string]: any };
    res: Response;
    config: ApiRouteConfig;
}

export type FilterResolve = (context?: FilterContext) => void;
export type FilterReject = (err?: any) => void;
export type FilterComplete = () => void;

export interface ApiFilterModule {
    /** 执行优先级，数值越小越先执行（如 -100 比 -50 先执行） */
    order?: number;
    /** 是否禁用该过滤器 */
    disabled?: boolean;
    /** 核心过滤逻辑 */
    doFilter: (
        resolve: FilterResolve,
        reject: FilterReject,
        complete: FilterComplete,
        context: FilterContext
    ) => void | Promise<void>;
}