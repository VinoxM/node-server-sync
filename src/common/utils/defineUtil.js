/**
 * 路由定义辅助函数，用于提供统一的路由对象类型推导与 IDE 智能提示
 * @param {import('@types/routeTypes.d.ts').ApiRouteModule} routes - 路由模块配置对象
 * @returns {import('@types/routeTypes.d.ts').ApiRouteModule} 原样返回路由配置对象
 */
export function defineRoutes(routes) {
    return routes;
}

/**
 * 过滤器定义辅助函数，用于提供统一的过滤器对象类型推导与 IDE 智能提示
 * @param {import('@types/filterTypes.d.ts').ApiFilterModule} filter - 过滤器模块配置对象
 * @returns {import('@types/filterTypes.d.ts').ApiFilterModule} 原样返回过滤器配置对象
 */
export function defineFilter(filter) {
    return filter;
}

/**
 * 定时任务定义辅助函数，用于提供统一的定时任务配置类型推导与 IDE 智能提示
 * @param {import('@types/scheduleTypes.d.ts').ScheduleJobConfig} jobConfig - 定时任务配置对象
 * @returns {import('@types/scheduleTypes.d.ts').ScheduleJobConfig} 原样返回定时任务配置对象
 */
export function defineScheduleJob(jobConfig) {
    return jobConfig;
}