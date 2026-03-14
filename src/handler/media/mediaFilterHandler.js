import { MEDIA_FILTER_TYPE } from "../../constraints/mediaConst.js"
import categoriesRep from "../../repository/media/categoriesRep.js"
import filterRulesRep, { getCacheByCategory, OPARETOR_TABLE as OPERATOR_TABLE } from "../../repository/media/filterRulesRep.js"

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
    if (!categoryInfo) return rules.map(() => false)
    const categoryId = categoryInfo.id
    const result = []
    for (const rule of rules) {
        const { author, uniqueId } = rule
        if (isAnyBlank(author, uniqueId)) {
            result.push(false)
            continue
        }
        const res = await checkVideoFilterRulesByCategoryId(categoryId, author, uniqueId)
        result.push(res)
    }
    return result
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

function validateFilterType(type) {
    CAN_OPARETOR_FILTER_TYPE.includes(type) || throwMessage('Invalid type.')
}

function validateOperator(operator) {
    ALLOWED_OPERATOR.includes(operator) || throwMessage('Invalid oparetor.')
}