/**
 * Bangumi infobox 键值提取匹配策略器
 */
export const MATCHERS = {
    /**
     * 从 infobox 中匹配第一个命中的键
     * @param {Array<{ key: string, value: any }>} infoBox - 信息盒原始列表
     * @param {string[]} matchers - 待匹配的键名候选列表
     * @param {string} [label] - 规范化输出标签
     * @returns {{ key: string, value: string[] }|null}
     */
    matchFirst: (infoBox, matchers, label) => {
        const info = infoBox.find(info_ => matchers.includes(info_.key));
        if (!info) return null;
        const { key, value } = info;
        return {
            key: label ?? key,
            value: Array.isArray(value) ? value.map(o => o.v ?? o) : [value],
        };
    },

    /**
     * 从 infobox 中匹配全部命中的键并合并值数组
     * @param {Array<{ key: string, value: any }>} infoBox - 信息盒原始列表
     * @param {string[]} matchers - 待匹配的键名候选列表
     * @param {string} label - 规范化输出标签
     * @returns {{ key: string, value: string[] }|null}
     */
    concat: (infoBox, matchers, label) => {
        const result = { key: label, value: [] };
        for (const match of matchers) {
            const info = infoBox.find(info_ => info_.key === match);
            if (!info) continue;
            const { key, value } = info;
            result.key ??= key;
            if (Array.isArray(value)) {
                result.value.push(...value.map(o => o.v ?? o));
            } else {
                result.value.push(value);
            }
        }
        return result.value.length > 0 ? result : null;
    },
};

/**
 * Staff 制作人员清洗映射规则配置
 * @type {Array<{ label?: string, matchers: string[], type?: 'matchFirst'|'concat' }>}
 */
export const STAFF_TAG_CLEAN = [
    {
        label: '原作',
        matchers: ["原作", "原案", "原作・原案", "原作者"],
    },
    {
        label: '总导演',
        matchers: ["總監督", "总导演", "总监督"],
    },
    {
        label: '导演',
        matchers: ["导演", "监督"],
    },
    {
        matchers: ["系列构成", "系列构成・脚本", "剧本统筹"],
    },
    {
        label: '人物设定',
        matchers: ["人物设定", "角色设计", "人设"],
    },
    {
        matchers: ["怪物设计"],
    },
    {
        label: '音乐',
        matchers: ["音乐", "音乐制作"],
        type: 'concat'
    },
    {
        label: '动画制作',
        matchers: ["动画制作", "制作公司", "制作", "动画制作公司"],
    },
    {
        matchers: ["Copyright"],
    }
];