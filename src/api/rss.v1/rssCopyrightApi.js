import apiMethodConst from '../../constraints/apiMethodConst.js';
import apiQueryConst from '../../constraints/apiQueryConst.js';
import apiBodyConst from '../../constraints/apiBodyConst.js';
import rssCopyrightRep from '../../repository/rss/rssCopyrightRep.js';
import { checkBodyKeysExists, checkBodyKeyNotBlank, checkQueryKeyNotBlank } from '../../common/apiPreCheck.js';

const { GET, POST } = apiMethodConst;
const { PID: QUERY_PID, ID: QUERY_ID } = apiQueryConst;
const { ID: BODY_ID, PID: BODY_PID, HREF, AREA, IMAGE } = apiBodyConst;

export default {
    basePath: "/rss/copyright",
    "/getMany": {
        method: GET,
        ignoreOutput: true,
        preCheck: (req) => checkQueryKeyNotBlank(req, QUERY_PID),
        callback: (req) => {
            return rssCopyrightRep.selectByPid(req.query.pid).then(data => data.data);
        }
    },
    "/editOne": {
        method: POST,
        preCheck: (req) => {
            checkBodyKeyNotBlank(req, BODY_ID);
            checkBodyKeysExists(req, [HREF, AREA, IMAGE]);
        },
        callback: (req) => {
            return new Promise((resolve, reject) => {
                rssCopyrightRep.updateOne(req.body).then(res => {
                    if (res.rows === 0) {
                        reject({ msg: 'Update failed.' });
                    } else resolve({ rows: res.rows });
                }).catch(reject);
            })
        }
    },
    "/addOne": {
        method: POST,
        preCheck: (req) => checkBodyKeysExists(req, [BODY_PID, HREF, AREA, IMAGE]),
        callback: (req) => {
            return new Promise((resolve, reject) => {
                rssCopyrightRep.insertOne(req.body).then(res => {
                    if (res.rows === 0) {
                        reject({ msg: 'Add failed.' });
                    } else resolve({ rows: res.rows });
                }).catch(reject);
            })
        }
    },
    "/delOne": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, BODY_ID),
        callback: (req) => {
            return rssCopyrightRep.deleteOne(req.body[BODY_ID]).then(({ rows }) => ({ rows }));
        }
    },
    "/delMany": {
        method: POST,
        preCheck: (req) => checkBodyKeyNotBlank(req, BODY_PID),
        callback: (req) => {
            return rssCopyrightRep.deleteManyByPid(req.body[BODY_PID]).then(({ rows }) => ({ rows }));
        }
    },
    "/getImage": {
        method: GET,
        ignoreOutput: true,
        callback: () => {
            return rssCopyrightRep.selectAllImage();
        }
    }
}