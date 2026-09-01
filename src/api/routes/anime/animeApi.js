import apiMethodConst from "../../../common/constants/apiMethodConst.js";
import { getNextSeason } from "../../../common/utils/dateUtil.js";
import { checkQueryKeyNotBlank } from "../../../common/utils/preCheckUtil.js";
import { getActorImage, getSubjectCharacterImage, getSubjectCover } from "../../../modules/anime/service/bangumi/bangumiImagesService.js";
import { pullAnimeSubjects, pullCurrentSeasonAnime } from "../../../modules/anime/service/subjects/subjectPullService.js";
import { getAnimeCalendar, getAnimeInformation } from "../../../modules/anime/service/subjects/subjectSearchService.js";
import { decodeAuthorization } from "../../../modules/authorization/authorizationService.js";

const { GET, POST } = apiMethodConst;

const needSecret = () => 'mAou5820.anime'

export default {
    basePath: '/anime',
    "/calendar": {
        method: GET,
        needSecret,
        callback: () => getAnimeCalendar()
    },
    "/information": {
        method: GET,
        needSecret,
        preCheck: req => checkQueryKeyNotBlank(req, 'id'),
        callback: async req => {
            const userInfo = await decodeAuthorization(req, 1)
            return getAnimeInformation(req.query.id, userInfo)
        }
    },
    "/pullAnime": {
        method: POST,
        needSecret,
        callback: req => {
            const forceUpdate = req.body.force === 'true' || Boolean(req.body.force)
            if (__isNotBlank(req.body.season)) {
                /^[0-9]{4}-[01|04|07|10]$/.test(req.body.season) || __throwMessage('Invalid season.');
                const [year, month] = req.body.season.split('-');
                const startDate = `${year}-${month}-01`;
                const [nextYear, nextMonth] = getNextSeason([year, month]);
                const endDate = `${nextYear}-${nextMonth}-01`;
                return pullAnimeSubjects([startDate, endDate], forceUpdate);
            }
            return pullCurrentSeasonAnime(forceUpdate)
        }
    },
    /** Images Static Resource */
    "/images/actor/(\\d+)$": {
        pathRegex: true,
        method: GET,
        ignoreSecret: true,
        callback: async (req, res) => {
            const actorId = req.params[0]
            if (__isBlank(actorId)) {
                __throwMessage('Not Found', -404, 404)
            }
            await getActorImage(actorId, res)
        }
    },
    "/images/subject/(\\d+)/cover$": {
        pathRegex: true,
        method: GET,
        ignoreSecret: true,
        callback: async (req, res) => {
            const subjectId = req.params[0]
            if (__isBlank(subjectId)) {
                __throwMessage('Not Found', -404, 404)
            }
            await getSubjectCover(subjectId, res)
        }
    },
    "/images/subject/(\\d+)/character/(\\d+)$": {
        pathRegex: true,
        method: GET,
        ignoreSecret: true,
        callback: async (req, res) => {
            const subjectId = req.params[0]
            const characterId = req.params[1]
            if (__isAnyBlank(subjectId, characterId)) {
                __throwMessage('Not Found', -404, 404)
            }
            await getSubjectCharacterImage(subjectId, characterId, res)
        }
    }
}