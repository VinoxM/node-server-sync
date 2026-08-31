import { SUBJECT_HIDE_VALUE, SUBJECT_NSFW_VALUE } from "../constants/subjectConstant.js";

export const SUBJECT_RESULT_MAP = [
    { property: 'id', column: 'id' },
    { property: 'bangumiId', column: 'bangumi_id' },
    { property: 'name', column: 'name' },
    { property: 'nameCN', column: 'name_cn' },
    { property: 'nameAlias', column: 'name_alias' },
    { property: 'platform', column: 'platform' },
    { property: 'airDate', column: 'air_date' },
    { property: 'season', column: 'season' },
    { property: 'summary', column: 'summary' },
    { property: 'summaryCN', column: 'summary_cn' },
    { property: 'totalEpisodes', column: 'total_episodes' },
    { property: 'cover', column: 'cover' },
    { property: 'metaTags', column: 'meta_tags' },
    { property: 'staff', column: 'staff' },
    { property: 'characters', column: 'characters' },
    { property: 'hide', column: 'hide', defaultValue: () => SUBJECT_HIDE_VALUE.NO },
    { property: 'nsfw', column: 'nsfw', defaultValue: () => SUBJECT_NSFW_VALUE.NO },
    { property: 'updateTime', column: 'update_time', defaultValue: () => new Date() },
    { property: 'createTime', column: 'create_time', defaultValue: () => new Date() }
]

export function convertPropertiesToCloumns(properties = []) {
    const result = [];
    for (const property of properties) {
        const option = SUBJECT_RESULT_MAP.find(m => m.property === property);
        option && result.push(option.column);
    }
    return result;
}