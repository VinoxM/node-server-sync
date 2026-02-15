import apiMethodConst from '../../constraints/apiMethodConst.js';
import apiQueryConst from '../../constraints/apiQueryConst.js';
import apiBodyConst from '../../constraints/apiBodyConst.js';
import rssLinkRep from '../../repository/rss/rssLinkRep.js';
import { checkBodyKeysExists, checkBodyKeyNotBlank, checkQueryKeyNotBlank } from '../../common/apiPreCheck.js';

const { GET, POST } = apiMethodConst;
const { PID: QUERY_PID, ID: QUERY_ID } = apiQueryConst;
const { ID: BODY_ID, PID: BODY_PID, HREF, TITLE } = apiBodyConst;

export default {
    basePath: "/rss/link",
    "/getMany": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => checkQueryKeyNotBlank(req, QUERY_PID),
        callback: (req) => {
            return rssLinkRep.selectByPid(req.query.pid).then(data=>data.data);
        }
    },
    "/editOne": {
        method: POST,
        preCheck: (req) => {
            checkBodyKeyNotBlank(req, BODY_ID);
            checkBodyKeysExists(req, [HREF, TITLE]);
        },
        callback: (req) => {
            return new Promise((resolve, reject) => {
                rssLinkRep.updateOne(req.body).then(res => {
                    if (res.rows === 0) {
                        reject({msg: 'Update failed.'});
                    } else resolve({rows: res.rows});
                }).catch(reject);
            })
        }
    },
    "/addOne": {
        method: POST,
        preCheck: (req) => checkBodyKeysExists(req, [QUERY_PID, HREF, TITLE]),
        callback: (req) => {
            return new Promise((resolve, reject) => {
                rssLinkRep.insertOne(req.body).then(res => {
                    if (res.rows === 0) {
                        reject({msg: 'Add failed.'});
                    } else resolve({rows: res.rows});
                }).catch(reject);
            })
        }
    },
    "/delOne": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, BODY_ID),
        callback: (req) => {
            return rssLinkRep.deleteOne(req.body[BODY_ID]).then(({rows})=> ({rows}));
        }
    },
    "/delMany": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, BODY_PID),
        callback: (req) => {
            return rssLinkRep.deleteManyByPid(req.body[BODY_PID]).then(({rows})=> ({rows}));
        }
    }
}