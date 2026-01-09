import fs from 'fs';
import apiMethodConst from '../../constraints/apiMethodConst.js';
import bodyConst from '../../constraints/apiBodyConst.js';
import { checkBodyKeyNotBlank, checkBodyKeysNotBlank, checkBodyKeysExists, checkBodyKeyNotEmptyArray } from '../../common/apiPreCheck.js';
import { analysisRssSubscribe, updateRssSubscribe } from '../../handler/rss/rssSubscribeHandler.js';
import rssSubscribeRep from '../../repository/rss/rssSubscribeRep.js';
import rssResultRep from '../../repository/rss/rssResultRep.js';
import rssLinkRep from '../../repository/rss/rssLinkRep.js';
import rssCopyrightRep from '../../repository/rss/rssCopyrightRep.js';
import { Executor } from '../../common/executor.js';

const { POST } = apiMethodConst;
const { URL, REGEX, ID, FIN, IDS } = bodyConst;

const needSecret = () => "mAou5820.subscribe";

const bodyNotBlankKeys = [
    bodyConst.NAME,
    bodyConst.SEASON,
    bodyConst.IS_SHORT,
    bodyConst.ANIME_TYPE,
    bodyConst.GOON,
]

const bodyExistsKeys = [
    bodyConst.REGEX,
    bodyConst.NAME_JP,
    bodyConst.URL,
    bodyConst.START_TIME,
    bodyConst.COVER,
    bodyConst.FIN,
    bodyConst.STAFF,
    bodyConst.CAST,
    bodyConst.ORIGIN_TYPE,
    bodyConst.TYPE_TAG,
    bodyConst.BROADCAST,
    bodyConst.LINK,
    bodyConst.COPYRIGHT
]

const checkRssSubscribeBody = (req, print = true) => {
    checkBodyKeysExists(req, bodyExistsKeys, print);
    checkBodyKeysNotBlank(req, bodyNotBlankKeys, print);
}

const checkRssSubscribeArrBody = (req) => {
    checkBodyKeyNotEmptyArray(req, bodyConst.RSS_SUBSCRIBE_ARRAY);
    const arr = req.body[bodyConst.RSS_SUBSCRIBE_ARRAY];
    arr.forEach(rss => {
        checkRssSubscribeBody({ body: rss }, true);
    });
}

const checkRssSubscribeReplaceParams = (req) => {
    checkBodyKeyNotBlank(req, bodyConst.REPLACE_BY);
    const replaceBy = req.body[bodyConst.REPLACE_BY];
    if ([bodyConst.NAME, bodyConst.COVER].indexOf(replaceBy) === -1) {
        throwMessage('Unsupported key to replace by.', -5);
    }
    checkBodyKeyNotEmptyArray(req, bodyConst.REPLACE_PARAMS);
    const paramsArr = [...(bodyExistsKeys.filter(str => str !== bodyConst.URL && str !== bodyConst.REGEX)), ...bodyNotBlankKeys];
    const supportedParams = req.body[bodyConst.REPLACE_PARAMS].filter(str => paramsArr.indexOf(str) > -1 && replaceBy !== str);
    if (supportedParams.length === 0) {
        throwMessage("Has no one supported replace params.", -5);
    }
    req.body[bodyConst.REPLACE_PARAMS] = supportedParams;
}

const checkRssSubscribeReplaceArrBody = (req) => {
    checkBodyKeyNotEmptyArray(req, bodyConst.RSS_SUBSCRIBE_ARRAY);
    const supportedParams = req.body[bodyConst.REPLACE_PARAMS];
    const replaceBy = req.body[bodyConst.REPLACE_BY];
    const checkArr = [...supportedParams, replaceBy, bodyConst.SEASON]
    const arr = req.body[bodyConst.RSS_SUBSCRIBE_ARRAY];
    arr.forEach(rss => {
        checkBodyKeysExists({ body: rss }, checkArr, false);
    });
}

export default {
    basePath: "/rss/subscribe",
    "/addOne": {
        method: POST,
        needSecret,
        preCheck: checkRssSubscribeBody,
        callback: (req) => {
            return sqliteDB.getTransactionDB(async (db) => {
                const { rows, lastId } = await rssSubscribeRep.insertOne(req.body, db);
                if (rows === 0) {
                    throwMessage('Add failed. Cause exists.');
                }
                const link = req.body[bodyConst.LINK];
                if (isNotEmptyArray(link)) {
                    await rssLinkRep.insertManyWithPid(link, lastId, db);
                }
                const copyright = req.body[bodyConst.COPYRIGHT];
                if (isNotEmptyArray(copyright)) {
                    await rssCopyrightRep.insertManyWithPid(copyright, lastId, db);
                }
                return { rows }
            }, (err) => {
                throw err;
            })
        }
    },
    "/addMany": {
        method: POST,
        needSecret,
        preCheck: checkRssSubscribeArrBody,
        callback: (req) => {
            const rssArr = req.body[bodyConst.RSS_SUBSCRIBE_ARRAY];
            return sqliteDB.getTransactionDB(async (db) => {
                return new Promise(async (resolve, reject) => {
                    const linkResults = [], copyrightResults = [];
                    let handledRows = 0;
                    new Executor(async () => {
                        try {
                            if (linkResults.length > 0) {
                                await rssLinkRep.insertMany(linkResults, db);
                            }
                            if (copyrightResults.length > 0) {
                                await rssCopyrightRep.insertMany(copyrightResults, db);
                            }
                        } catch (err) {
                            reject(err)
                        }
                        resolve({ rows: handledRows });
                    }, reject).submitAll(rssArr.map(rss => async (resolve_1, reject_1, complete, { linkArr, copyrightArr }) => {
                        const { rows, lastId } = await rssSubscribeRep.insertOne(rss, db);
                        if (rows !== 0) {
                            handledRows++;
                            const link = rss[bodyConst.LINK];
                            if (isNotEmptyArray(link)) {
                                linkArr.push(...link.map(obj => (obj.pid = lastId, obj)))
                            }
                            const copyright = rss[bodyConst.COPYRIGHT];
                            if (isNotEmptyArray(copyright)) {
                                copyrightArr.push(...copyright.map(obj => (obj.pid = lastId, obj)))
                            }
                        }
                        resolve_1({ linkArr, copyrightArr });
                    })).start({ linkArr: linkResults, copyrightArr: copyrightResults })
                })
            }, (err) => {
                throw err;
            })
        }
    },
    /**
     * @requestBody
     * {
     *  seasons: [...], // required, not empty Array
     *  replaceBy: "", // required, supported value: name, cover
     *  replaceParams: [...], // required, not empty Array exclude @replaceBy, supported value: exclude season,url,regex
     *  rssSubs: [...] // required, not empty Array, every item must inclde replaceParams and repalceBy and season
     * }
     */
    "/replaceMany": {
        method: POST,
        needSecret,
        preCheck: (req) => {
            checkBodyKeyNotEmptyArray(req, bodyConst.SEASONS);
            checkRssSubscribeReplaceParams(req);
            checkRssSubscribeReplaceArrBody(req);
        },
        callback: async (req) => {
            const { data: results } = await rssSubscribeRep.selectForReplaceBySeasons(req.body[bodyConst.SEASONS]);
            if (results.length === 0) return { rows: 0 }
            let handledRows = 0;
            const replaceBy = req.body[bodyConst.REPLACE_BY]
            const arr = req.body[bodyConst.RSS_SUBSCRIBE_ARRAY]
            let params = req.body[bodyConst.REPLACE_PARAMS]
            const containsLink = params.indexOf(bodyConst.LINK) > -1;
            const containsCopyright = params.indexOf(bodyConst.COPYRIGHT) > -1;
            params = params.filter(str => str !== bodyConst.LINK && str !== bodyConst.COPYRIGHT && str !== bodyConst.SEASON);
            const delLinkIds = [], delCopyrightIds = [];
            const addLinkArr = [], addCopyrightArr = [];
            const dbPath = __env.get('sqlite.dbPath', '@/db')
            const backDir = __join(dbPath, 'backup')
            if (!fs.existsSync(backDir)) {
                fs.mkdirSync(backDir)
            }
            fs.copyFileSync(__join(dbPath, 'rss.db'), __join(backDir, 'rss_' + new Date().getTime() + '.db'))
            return sqliteDB.getTransactionDB((db) => {
                return new Promise((resolve, reject) => {
                    new Executor(async () => {
                        try {
                            if (delLinkIds.length > 0) await rssLinkRep.deleteManyByPids(delLinkIds, db);
                            if (addLinkArr.length > 0) await rssLinkRep.insertMany(addLinkArr, db);
                            if (delCopyrightIds.length > 0) await rssCopyrightRep.deleteManyByPids(delCopyrightIds, db);
                            if (addCopyrightArr.length > 0) await rssCopyrightRep.insertMany(addCopyrightArr, db);
                            resolve({ rows: handledRows });
                        } catch (err) {
                            reject(err)
                        }
                    }, reject).submitAll(arr.map(sub => {
                        const filter = results.filter(rss => rss[replaceBy] === sub[replaceBy] && rss[bodyConst.SEASON] === sub[bodyConst.SEASON]);
                        if (filter.length === 0) {
                            return (resolve_1) => { resolve_1() }
                        }
                        return async (resolve_1, reject_1) => {
                            const result = filter[0];
                            const replace = {};
                            params.forEach(key => replace[key] = sub[key]);
                            try {
                                const { rows } = await rssSubscribeRep.updateOneWithParamsById(result.id, replace, db);
                                if (rows > 0) {
                                    if (containsLink) {
                                        delLinkIds.push(result.id);
                                        if (isNotEmptyArray(sub[bodyConst.LINK])) addLinkArr.push(...(sub[bodyConst.LINK].map(obj => (obj.pid = result.id, obj))));
                                    }
                                    if (containsCopyright) {
                                        delCopyrightIds.push(result.id);
                                        if (isNotEmptyArray(sub[bodyConst.COPYRIGHT])) addCopyrightArr.push(...(sub[bodyConst.COPYRIGHT].map(obj => (obj.pid = result.id, obj))));
                                    }
                                }
                                handledRows += rows;
                                resolve_1()
                            } catch (err) {
                                reject_1(err)
                            }
                        }
                    })).start();
                })
            }, err => { throw err })
        }
    },
    "/delOne": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID),
        callback: (req) => {
            return sqliteDB.getTransactionDB(async (db) => {
                const id = req.body[ID];
                const { rows } = await rssSubscribeRep.deleteById(id, db);
                if (rows !== 0) {
                    await rssResultRep.deleteByPid(id, db);
                    await rssLinkRep.deleteManyByPid(id, db);
                    await rssCopyrightRep.deleteManyByPid(id, db);
                }
                return { rows };
            }, err => { throw err })
        }
    },
    "/delMany": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeyNotEmptyArray(req, IDS),
        callback: (req) => {
            return sqliteDB.getTransactionDB(async (db) => {
                const ids = req.body[IDS];
                const { rows } = await rssSubscribeRep.deleteByIds(ids, db);
                if (rows !== 0) {
                    await rssResultRep.deleteByPids(ids, db);
                    await rssLinkRep.deleteManyByPids(ids, db);
                    await rssCopyrightRep.deleteManyByPids(ids, db);
                }
                return { rows };
            }, err => { throw err })
        }
    },
    "/editOne": {
        method: POST,
        needSecret,
        preCheck: (req) => {
            checkBodyKeyNotBlank(req, ID);
            checkBodyKeysExists(req, [REGEX, URL]);
        },
        callback: (req) => {
            return rssSubscribeRep.updateOneById(req.body).then(res => ({ rows: res.rows }));
        }
    },
    "/updateOne": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID),
        callback: (req) => {
            return updateRssSubscribe([req.body[ID]]);
        }
    },
    "/updateMany": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeyNotEmptyArray(req, IDS),
        callback: (req) => {
            return updateRssSubscribe(req.body[IDS])
        }
    },
    "/setFin": {
        method: POST,
        preCheck: (req) => checkBodyKeysNotBlank(req, [ID, FIN]),
        callback: async (req) => {
            const { rows } = await rssSubscribeRep.updateFinById(req.body[ID], req.body[FIN]);
            if (rows === 0) {
                throwMessage('Set fin failed. Cause not exists.');
            }
        }
    },
    "/subTest": {
        method: POST,
        ignoreOutput: true,
        preCheck: (req) => checkBodyKeyNotBlank(req, URL),
        callback: (req) => {
            return new Promise((resolve, reject) => {
                analysisRssSubscribe({ regex: req.body[REGEX], url: req.body[URL] }, resolve, reject);
            }).then(results => results.map(item => ({ title: item.title, pubDate: item.pubDate, torrent: item.torrent })))
        }
    }
}