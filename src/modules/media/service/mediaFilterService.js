import {
    MEDIA_FILTER_TYPE
} from "../constants/mediaConst.js"
import categoriesRep from "../repository/categoriesRep.js"
import filterRulesRep, { getCacheByCategory, OPERATOR_TABLE } from "../repository/filterRulesRep.js"
import videosRep from "../repository/videosRep.js"
import { getMediaPolicyDefaultAllowed } from "./mediaOptionsService.js"

const CAN_OPERATOR_FILTER_TYPE = Object.values(MEDIA_FILTER_TYPE)
const ALLOWED_OPERATOR = Object.keys(OPERATOR_TABLE)

export async function checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId) {
    const cache = await getCacheByCategory(categoryId)
    const { whitelist, blacklist } = cache
    if (blacklist?.uniqueId?.has(uniqueId)) return false
    if (whitelist?.uniqueId?.has(uniqueId)) return true
    if (blacklist?.author?.has(author)) return false
    if (whitelist?.author?.has(author)) return true
    return await getMediaPolicyDefaultAllowed();
}

export async function checkVideoFilterRules(body) {
    const { category, rules } = body
    const categoryInfo = await categoriesRep.selectOneByName(category)
    if (!categoryInfo) return rules.map(() => ({ downloaded: false, blocked: false, allowed: false }))
    const categoryId = categoryInfo.id
    const results = []
    const cache = await getCacheByCategory(categoryId)
    const { whitelist, blacklist } = cache
    const uniqueIds = []
    const defaultAllowed = await getMediaPolicyDefaultAllowed()
    for (const rule of rules) {
        const { author, uniqueId } = rule
        const result = { downloaded: null, blocked: false, allowed: false, canAdd: defaultAllowed }
        if (whitelist?.uniqueId?.has(uniqueId) || whitelist?.author?.has(author)) {
            result.allowed = true
        } else if (blacklist?.uniqueId?.has(uniqueId) || blacklist?.author?.has(author)) {
            result.blocked = true
        }
        result.canAdd = result.blocked ? false : (result.allowed || defaultAllowed)
        if (__isNotBlank(uniqueId)) {
            uniqueIds.push(uniqueId)
        } else {
            result.downloaded = false
        }
        results.push(result)
    }
    const videos = []
    if (uniqueIds.length > 0) {
        const data = await videosRep.selectByUniqueIds(uniqueIds, categoryId).then(({ data }) => data)
        videos.push(...data)
    }
    return results.map((r, i) => {
        if (r.downloaded === null) {
            const { author, uniqueId } = rules[i]
            r.downloaded = videos.some(v => (__isNotBlank(author) ? v.authorName === author : true) && v.uniqueId === uniqueId)
        }
        return r
    })
}

export async function handleFilterRule(body, isAdd = true) {
    const { category, type, value, operator } = body
    validateFilterType(type)
    validateOperator(operator)
    const categoryId = await getCategoryId(category)
    if (isAdd) {
        return filterRulesRep.insertOne(categoryId, type, value, operator).then(data => ({ rows: data.rows }))
    } else {
        return filterRulesRep.deleteOne(categoryId, type, value, operator).then(data => ({ rows: data.rows }))
    }
}

export async function getFilterRulesByCategory(categoryId) {
    const cache = await getCacheByCategory(categoryId)
    return {
        whitelist: {
            author: [...(cache?.whitelist?.author ?? [])],
            uniqueId: [...(cache?.whitelist?.uniqueId ?? [])]
        },
        blacklist: {
            author: [...(cache?.blacklist?.author ?? [])],
            uniqueId: [...(cache?.blacklist?.uniqueId ?? [])]
        }
    }
}

async function getCategoryId(category) {
    const categoryInfo = await categoriesRep.selectOneByName(category)
    categoryInfo || __throwMessage('Category not found.')
    return categoryInfo.id
}

function validateFilterType(type) {
    CAN_OPERATOR_FILTER_TYPE.includes(type) || __throwMessage('Invalid type.')
}

function validateOperator(operator) {
    ALLOWED_OPERATOR.includes(operator) || __throwMessage('Invalid operator.')
}