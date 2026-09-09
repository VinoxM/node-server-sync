import apiMethodConst from "#common/constants/apiMethodConst.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { defineRoutes } from "#common/utils/defineUtil.js";
import { checkBodyKeyMatch, checkBodyKeyNotBlank, checkBodyKeysExists, checkQueryKeyNotBlank } from "#common/utils/preCheckUtil.js";
import { getExistsSeasons, getSubjectForEdit, searchSubjects } from "#modules/anime/service/subject/subjectService.js";
import { fetchAnimeSubjectByBangumiId } from "#modules/anime/service/subject/subjectPullService.js";
import { createSubscribeBySubjectId } from "#modules/anime/service/rss/rssSubscribeService.js";

const { GET, POST } = apiMethodConst;
const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => 'mAou5820.anime.subject';

export default defineRoutes({
    basePath: '/anime/subject',
    '/getSeasons': {
        method: GET,
        needAuth,
        needSecret,
        callback: () => getExistsSeasons()
    },
    '/fetchBangumi': {
        method: GET,
        needAuth,
        needSecret,
        preCheck: req => checkQueryKeyNotBlank(req, 'bangumiId'),
        callback: req => {
            const bangumiId = req.query.bangumiId;
            return fetchAnimeSubjectByBangumiId(bangumiId);
        }
    },
    '/searchSubjects': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyMatch(req, 'season', [/[0-9]{4}-(01|04|07|10)/]) && checkBodyKeysExists(req, ['name']),
        callback: req => {
            const { season, name } = req.body;
            return searchSubjects(season, name);
        }
    },
    '/getSubjectDetail': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'subjectId'),
        callback: req => {
            const { subjectId } = req.body;
            return getSubjectForEdit(subjectId);
        }
    },
    '/initSubscribe': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'subjectId'),
        callback: req => {
            const { subjectId } = req.body;
            return createSubscribeBySubjectId(subjectId);
        }
    }
});