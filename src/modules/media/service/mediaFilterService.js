import {
    MEDIA_FILTER_TYPE
} from "../constants/mediaConst.js";
import categoriesRep from "../repository/categoriesRep.js";
import filterRulesRep, { getCacheByCategory, OPERATOR_TABLE } from "../repository/filterRulesRep.js";
import videosRep from "../repository/videosRep.js";
import { getMediaPolicyDefaultAllowed } from "./mediaOptionsService.js";

/** 支持的过滤类型列表 [1, 2] */
const CAN_OPERATOR_FILTER_TYPE = Object.values(MEDIA_FILTER_TYPE);
/** 允许的操作表类型键 ['0', '1'] */
const ALLOWED_OPERATOR = Object.keys(OPERATOR_TABLE);

/**
 * 根据分类 ID、作者与 uniqueId 进行黑白名单过滤规则校验
 * 优先级：黑名单 uniqueId > 白名单 uniqueId > 黑名单 author > 白名单 author > 系统默认策略
 * @param {number} categoryId - 分类 ID
 * @param {string} [author] - 创作者名称
 * @param {string} [uniqueId] - 视频唯一标识
 * @returns {Promise<boolean>} 是否允许入库
 */
export async function checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId) {
    const cache = await getCacheByCategory(categoryId);
    const { whitelist, blacklist } = cache;
    if (uniqueId && blacklist?.uniqueId?.has(uniqueId)) return false;
    if (uniqueId && whitelist?.uniqueId?.has(uniqueId)) return true;
    if (author && blacklist?.author?.has(author)) return false;
    if (author && whitelist?.author?.has(author)) return true;
    return await getMediaPolicyDefaultAllowed();
}

/**
 * 批量检查一组视频在指定分类下的黑白名单匹配状态与入库可行性
 * @param {Object} body - 请求载荷
 * @param {string} body.category - 分类名称
 * @param {Array<import('#types/mediaTypes.d.ts').MediaFilterCheckRule>} body.rules - 待校验规则列表
 * @returns {Promise<Array<import('#types/mediaTypes.d.ts').MediaFilterCheckResult>>}
 */
export async function checkVideoFilterRules(body) {
    const { category, rules } = body;
    const categoryInfo = await categoriesRep.selectOneByName(category);
    if (!categoryInfo) return rules.map(() => ({ downloaded: false, blocked: false, allowed: false, canAdd: false }));
    const categoryId = categoryInfo.id;
    const results = [];
    const cache = await getCacheByCategory(categoryId);
    const { whitelist, blacklist } = cache;
    const uniqueIds = [];
    const defaultAllowed = await getMediaPolicyDefaultAllowed();
    for (const rule of rules) {
        const { author, uniqueId } = rule;
        const result = { downloaded: null, blocked: false, allowed: false, canAdd: defaultAllowed };
        if ((uniqueId && whitelist?.uniqueId?.has(uniqueId)) || (author && whitelist?.author?.has(author))) {
            result.allowed = true;
        } else if ((uniqueId && blacklist?.uniqueId?.has(uniqueId)) || (author && blacklist?.author?.has(author))) {
            result.blocked = true;
        }
        result.canAdd = result.blocked ? false : (result.allowed || defaultAllowed);
        if (__isNotBlank(uniqueId)) {
            uniqueIds.push(uniqueId);
        } else {
            result.downloaded = false;
        }
        results.push(result);
    }
    const videos = [];
    if (uniqueIds.length > 0) {
        const data = await videosRep.selectByUniqueIds(uniqueIds, categoryId).then(({ data }) => data);
        videos.push(...data);
    }
    return results.map((r, i) => {
        if (r.downloaded === null) {
            const { uniqueId } = rules[i];
            r.downloaded = __isNotBlank(uniqueId) && videos.some(v => v.uniqueId === uniqueId);
        }
        return r;
    });
}

/**
 * 添加或删除单条黑白名单过滤规则
 * @param {Object} body - 规则参数
 * @param {string} body.category - 分类名称
 * @param {number} body.type - 规则类型 (1: author, 2: uniqueId)
 * @param {string} body.value - 匹配文本
 * @param {string} body.operator - 操作类型 ('0': whitelist, '1': blacklist)
 * @param {boolean} [isAdd=true] - true 为新增，false 为删除
 * @returns {Promise<{ rows: number }>}
 */
export async function handleFilterRule(body, isAdd = true) {
    const { category, type, value, operator } = body;
    validateFilterType(type);
    validateOperator(operator);
    const categoryId = await getCategoryId(category);
    if (isAdd) {
        return filterRulesRep.insertOne(categoryId, type, value, operator).then(data => ({ rows: data.rows }));
    } else {
        return filterRulesRep.deleteOne(categoryId, type, value, operator).then(data => ({ rows: data.rows }));
    }
}

/**
 * 获取指定分类下的全量黑白名单规则缓存列表
 * @param {number} categoryId - 分类 ID
 * @returns {Promise<{ whitelist: { author: string[], uniqueId: string[] }, blacklist: { author: string[], uniqueId: string[] } }>}
 */
export async function getFilterRulesByCategory(categoryId) {
    const cache = await getCacheByCategory(categoryId);
    return {
        whitelist: {
            author: [...(cache?.whitelist?.author ?? [])],
            uniqueId: [...(cache?.whitelist?.uniqueId ?? [])]
        },
        blacklist: {
            author: [...(cache?.blacklist?.author ?? [])],
            uniqueId: [...(cache?.blacklist?.uniqueId ?? [])]
        }
    };
}

/**
 * 校验并获取分类主键 ID
 * @param {string} category - 分类名称
 * @returns {Promise<number>} 分类 ID
 */
async function getCategoryId(category) {
    const categoryInfo = await categoriesRep.selectOneByName(category);
    categoryInfo || __throwMessage('Category not found.');
    return categoryInfo.id;
}

/**
 * 校验过滤规则类型合法性
 * @param {number} type - 规则类型
 */
function validateFilterType(type) {
    CAN_OPERATOR_FILTER_TYPE.includes(type) || __throwMessage('Invalid type.');
}

/**
 * 校验黑白名单操作表类型合法性
 * @param {string} operator - 操作表类型 ('0' 或 '1')
 */
function validateOperator(operator) {
    ALLOWED_OPERATOR.includes(operator) || __throwMessage('Invalid operator.');
}