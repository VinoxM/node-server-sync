import { MEDIA_FILTER_TYPE } from "../../constraints/mediaConst.js"
import authorsRep from "../../repository/media/authorsRep.js"
import categoriesRep from "../../repository/media/categoriesRep.js"
import filterRulesRep, { getCacheByCategory, OPARETOR_TABLE as OPERATOR_TABLE } from "../../repository/media/filterRulesRep.js"
import videosRep from "../../repository/media/videosRep.js"

const CAN_OPARETOR_FILTER_TYPE = Object.values(MEDIA_FILTER_TYPE)
const ALLOWED_OPERATOR = Object.keys(OPERATOR_TABLE)

export async function checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId) {
    const cache = await getCacheByCategory(categoryId)
    const { whitelist, blacklist } = cache
    if (blacklist?.uniqueId?.has(uniqueId)) return false
    if (whitelist?.uniqueId?.has(uniqueId)) return true
    if (blacklist?.author?.has(author)) return false
    if (whitelist?.author?.has(author)) return true
    return true
}

export async function checkVideoFilterRules(body) {
    const { category, rules } = body
    const categoryInfo = await categoriesRep.selectOneByName(category)
    if (!categoryInfo) return rules.map(() => ({ downloaded: false, blocked: false, allowed: false }))
    const categoryId = categoryInfo.id
    const results = []
    const cache = await getCacheByCategory(categoryId)
    const { whitelist, blacklist } = cache
    for (const rule of rules) {
        const { author, uniqueId } = rule
        const result = { downloaded: false, blocked: false, allowed: false }
        if (isAnyBlank(author, uniqueId)) {
            results.push(result)
            continue
        }
        if (whitelist?.uniqueId?.has(uniqueId) || whitelist?.author?.has(author)) {
            result.allowed = true
        } else if (blacklist?.uniqueId?.has(uniqueId) || blacklist?.author?.has(author)) {
            result.blocked = true
        }
        const authorInfo = await authorsRep.selectOneByName(author, categoryId)
        if (authorInfo) {
            const authorId = authorInfo.id
            const exists = await videosRep.selectForExists(categoryId, authorId, uniqueId)
            exists && (result.downloaded = true)
        }
        results.push(result)
    }
    return results
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

async function getCategoryId(category) {
    const categoryInfo = await categoriesRep.selectOneByName(category)
    categoryInfo || throwMessage('Category not found.')
    return categoryInfo.id
}

async function getAuthorId(author, categoryId) {
    const authorInfo = await authorsRep.selectOneByName(author, categoryId)
    return authorInfo.id
}

function validateFilterType(type) {
    CAN_OPARETOR_FILTER_TYPE.includes(type) || throwMessage('Invalid type.')
}

function validateOperator(operator) {
    ALLOWED_OPERATOR.includes(operator) || throwMessage('Invalid oparetor.')
}