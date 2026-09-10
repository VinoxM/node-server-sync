import apiMethodConst from "#common/constants/apiMethodConst.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { defineRoutes } from "#common/utils/defineUtil.js";
import { checkBodyKeyMatch, checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysExists, checkBodyKeysNotBlank } from "#common/utils/preCheckUtil.js";
import { getExistsSeasons, getSubjectForEdit, getSubjectForEditView, handleSubjectView, searchSubjects, updateSubjectFin, updateSubjectHide, updateSubjectIsShort, updateSubjectSeason } from "#modules/anime/service/subject/subjectService.js";
import { fetchAndCleanBangumiSubject, pullCleanedBangumiSubject } from "#modules/anime/service/subject/subjectPullService.js";
import { SUPPORTED_SUBJECT_API_PULL_UPDATE_COLUMN } from "#modules/anime/entity/subjectResultMap.js";
import { allowLanHosts } from "#common/constants/allowHostsConst.js";

const { GET, POST } = apiMethodConst;
const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => 'mAou5820.anime.subject';

export default defineRoutes({
    basePath: '/anime/subject',
    '/getSeasons': {
        method: GET,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        callback: () => getExistsSeasons()
    },
    '/searchSubjects': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyMatch(req, 'season', [/[0-9]{4}-(01|04|07|10)/]) && checkBodyKeysExists(req, ['name']),
        callback: req => {
            const { season, name } = req.body;
            return searchSubjects(season, name);
        }
    },
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
    '/fetchBangumi': {
        method: POST,
        needAuth,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'bangumiId'),
        callback: async req => {
            const bangumiId = req.body.bangumiId;
            const cleanedSubject = await fetchAndCleanBangumiSubject(bangumiId, { ignoreImages: true });
            const view = handleSubjectView(cleanedSubject);
            return {
                ...view,
                nsfw: cleanedSubject.nsfw
            }
        }
    },
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