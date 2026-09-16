import apiMethodConst from "#common/constants/apiMethodConst.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { defineRoutes } from "#common/utils/defineUtil.js";
import { checkBodyKeyMatch, checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysExists, checkBodyKeysNotBlank } from "#common/utils/preCheckUtil.js";
import {
    getExistsSeasons, getSubjectForEdit, getSubjectForEditView,
    handleSubjectView, searchSubjects, updateSubjectFin,
    updateSubjectHide, updateSubjectIsShort, updateSubjectSeason
} from "#modules/anime/service/subject/subjectService.js";
import { fetchAndCleanBangumiSubject, pullCleanedBangumiSubject } from "#modules/anime/service/subject/subjectPullService.js";
import { SUPPORTED_SUBJECT_API_PULL_UPDATE_COLUMN } from "#modules/anime/entity/subjectResultMap.js";
import { allowLanHosts } from "#common/constants/allowHostsConst.js";

const { GET, POST } = apiMethodConst;
const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => 'mAou5820.anime.subject';
const SEASON_MATCHER = /[0-9]{4}-(01|04|07|10)/;

/**
 * 番剧条目管理与维护后台路由模块 (`/anime/subject/*`)
 */
export default defineRoutes({
    basePath: '/anime/subject',

    /**
     * 获取数据库中已存在的所有番剧季度列表
     */
    '/getSeasons': {
        method: GET,
        needSecret,
        callback: () => getExistsSeasons()
    },

    /**
     * 根据季度与名称模糊搜索番剧（后台编辑列表）
     * 请求体参数：{ season: '2026-10', name?: string }
     */
    '/searchSubjects': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeysExists(req, ['name', 'season'])
            && __isNotBlank(req.body.season)
            && checkBodyKeyMatch(req, 'season', [SEASON_MATCHER]),
        callback: req => {
            const { season, name } = req.body;
            return searchSubjects(season, name);
        }
    },

    /**
     * 获取指定番剧在指定季度的编辑视图信息（用于续订/连载配置）
     * 请求体参数：{ id: number, season: string }
     */
    '/getSubjectForRenew': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => {
            const { id, season } = req.body;
            return getSubjectForEditView(id, season);
        }
    },

    /**
     * 获取单条番剧编辑详情（回填封面与角色的原始网络图片地址）
     * 请求体参数：{ subjectId: number }
     */
    '/getSubjectDetail': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'subjectId'),
        callback: req => {
            const { subjectId } = req.body;
            return getSubjectForEdit(subjectId);
        }
    },

    /**
     * 实时从 Bangumi 拉取并清洗单条条目数据（不入库，仅用于预览对比）
     * 请求体参数：{ bangumiId: number }
     */
    '/fetchBangumi': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'bangumiId'),
        callback: async req => {
            const bangumiId = req.body.bangumiId;
            const cleanedSubject = await fetchAndCleanBangumiSubject(bangumiId, { collectImage: false, useOriginImage: true, persistenceImage: false });
            const view = handleSubjectView(cleanedSubject);
            return {
                ...view,
                nsfw: cleanedSubject?.nsfw
            };
        }
    },

    /**
     * 从 Bangumi 拉取条目并更新指定字段到数据库
     * 请求体参数：{ bangumiId: number, updateProperties: string[] }
     */
    '/pullAndUpdateSubject': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'bangumiId') && checkBodyKeyNotEmptyArray(req, 'updateProperties'),
        callback: req => {
            const { bangumiId, updateProperties = [] } = req.body;
            const toUpdateProps = updateProperties.filter(p => SUPPORTED_SUBJECT_API_PULL_UPDATE_COLUMN.includes(p));
            __isEmptyArray(toUpdateProps) && __throwMessage('No supported update properties');
            return pullCleanedBangumiSubject(bangumiId, toUpdateProps);
        }
    },

    /**
     * 更新番剧条目的所属季节
     * 请求体参数：{ id: number, season: '2026-10' }
     */
    '/update.season': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id') && checkBodyKeyMatch(req, 'season', [/[0-9]{4}-(01|04|07|10)/]),
        callback: req => {
            const { id, season } = req.body;
            return updateSubjectSeason(id, season);
        }
    },

    /**
     * 更新番剧条目前台隐藏/显示状态
     * 请求体参数：{ id: number, hide: 0|1 }
     */
    '/update.hide': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'hide']),
        callback: req => {
            const { id, hide } = req.body;
            return updateSubjectHide(id, hide);
        }
    },

    /**
     * 更新番剧条目是否为泡面番
     * 请求体参数：{ id: number, short: 0|1 }
     */
    '/update.short': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id') && checkBodyKeyMatch(req, 'short', [/[01]/]),
        callback: req => {
            const { id, short } = req.body;
            return updateSubjectIsShort(id, short);
        }
    },

    /**
     * 更新番剧条目是否已完结
     * 请求体参数：{ id: number, fin: 0|1 }
     */
    '/update.fin': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'id') && checkBodyKeyMatch(req, 'fin', [/[01]/]),
        callback: req => {
            const { id, fin } = req.body;
            return updateSubjectFin(id, fin);
        }
    }
});