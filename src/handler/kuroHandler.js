import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import kuroRep from '../repository/kuroRep.js';
import { Executor } from '../common/executor.js';
import { generateFixedString, generateUUID } from '../common/stringUtil.js';

async function saveKuroAccount({ uid, token, signGames = '' }) {
    await kuroRep.insertOrUpdateAccount({ uid, token });
    await kuroRep.insertOrUpdateSignGames({ uid, games: signGames });
}

const generateCommonHeaders = (uid, token) => {
    const kuroUid = uid + '';
    return {
        pragma: 'no-cache',
        'cache-control': 'no-cache',
        'sec-ch-ua': `"Not)A;Brand";v="99", "Android WebView";v="12${kuroUid.substring(kuroUid.length - 1)}", "Chromium";v="12${kuroUid.substring(kuroUid.length - 1)}"`,
        source: 'android',
        'sec-ch-ua-mobile': '?1',
        'user-agent': `Mozilla/5.0 (Linux; Android 14; 23127PN0CC Build/UKQ1.230804.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/12${kuroUid.substring(kuroUid.length - 1)}.0.${kuroUid.substring(kuroUid.length - 4)}.${kuroUid.substring(kuroUid.length - 2)} Mobile Safari/537.36 Kuro/2.2.1 KuroGameBox/2.2.1`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json, text/plain, */*',
        devCode: generateFixedString(kuroUid),
        token,
        'sec-ch-ua-platform': '"Android"',
        origin: 'https://web-static.kurobbs.com',
        'sec-fetch-site': 'same-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        priority: 'u=1, i'
    }
}

const generateDefaultHeaders = (uid, token, needUUID) => {
    const kuroUid = uid + '';
    let headers = {
        devCode: generateFixedString(kuroUid),
        ip: `192.168.1.1${kuroUid.substring(kuroUid.length - 2)}`,
        source: "android",
        version: "2.2.1",
        versionCode: "2210",
        osVersion: "Android",
        countryCode: "CN",
        model: "23127PN0CC",
        lang: "zh-Hans",
        channelId: "2",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        "accept-encoding": "gzip",
        "User-Agent": "okhttp/3.11.0"
    }
    if (token) {
        headers = { ...headers, token, Cookie: `user_token=${token}` }
    }
    if (needUUID) {
        headers = { ...headers, distinct_id: generateUUID(kuroUid) }
    }
    return headers;
}

const kuroSDKLogin = ({ uid, mobile, code, signGames = '3' }) => {
    const url = "https://api.kurobbs.com/user/sdkLogin";
    const headers = generateDefaultHeaders(uid, null, true);
    const data = {
        code,
        devCode: headers.devCode,
        gameList: "",
        mobile
    }
    return new Promise((resolve, reject) => {
        axios.post(url, data, { headers }).then(({ data: res }) => {
            if (res.code === 200) {
                const token = res.data.token;
                saveKuroAccount({ uid, token, signGames }).then(resolve).catch(reject);
            } else {
                reject({ msg: res.msg });
            }
        }).catch(reject);
    })
}

const kuroTokenLogin = (token, signGames = '3') => {
    let uid;
    try {
        const { userId } = jwtDecode(token);
        uid = userId;
    } catch (error) {
        return Promise.reject({ msg: 'token decode failed.' })
    }
    const url = "https://api.kurobbs.com/user/mineV2";
    const headers = generateDefaultHeaders(uid, token, true);
    const data = { otherUserId: uid };
    return new Promise((resolve, reject) => {
        axios.post(url, data, { headers }).then(({ data: res }) => {
            if (res.code === 200) {
                saveKuroAccount({ uid, token, signGames }).then(resolve).catch(reject);
            } else {
                reject({ msg: res.msg });
            }
        }).catch(reject);
    })
}

const kuroLogout = (uid) => {
    return kuroRep.deleteAccountByUid(uid).then(() => null);
}

const kuroSignGameUpdate = async (uid, signGames) => {
    const exists = await kuroRep.selectTokenByUid(uid);
    if (exists) {
        return kuroRep.insertOrUpdateSignGames({ uid, games: signGames }).then(() => null);
    } else {
        return Promise.reject({ msg: `not login.` });
    }
}

const kuroGameRoleList = (uid, token, gameId = 3) => {
    const url = "https://api.kurobbs.com/user/role/findRoleList";
    const headers = generateDefaultHeaders(uid, token, false);
    const data = { gameId };
    return new Promise((resolve, reject) => {
        axios.post(url, data, { headers }).then(({ data: res }) => {
            if (res.code === 200) {
                if (res.data.length > 0) {
                    resolve({ serverId: res.data[0].serverId, roleId: res.data[0].roleId })
                } else {
                    reject({ msg: "未找到可签到角色" });
                }
            } else {
                reject({ msg: res.msg });
            }
        }).catch(reject);
    })
}

const kuroGameSign = (uid, token_, gameId = 3) => {
    return new Promise(async (resolve, reject) => {
        let token = token_;
        if (!token_) {
            try {
                token = await kuroRep.selectTokenByUid(uid);
            } catch (e) {
                __log.info(e.message);
            }
        }
        if (!token) reject({ msg: `account token not found: ${uid}` })
        kuroGameRoleList(uid, token, gameId).then(({ serverId, roleId }) => {
            const url = "https://api.kurobbs.com/encourage/signIn/v2";
            const headers = generateCommonHeaders(uid, token);
            const data = {
                gameId,
                serverId,
                roleId,
                userId: uid,
                reqMonth: String(new Date().getMonth() + 1).padStart(2, '0')
            }
            axios.post(url, data, { headers }).then(({ data: res }) => {
                if (res.code === 200) {
                    resolve();
                } else {
                    reject({ msg: res.msg });
                }
            }).catch(reject);
        }).catch(reject);
    })
}

const kuroGameSignAll = () => {
    return new Promise(async (resolve, reject) => {
        let handleCount = 0;
        let errorCount = 0;
        const reasons = [];
        let accounts = { rows: 0 };
        try {
            accounts = await kuroRep.selectAllSignAccount();
        } catch (e) {
            __log.info(e.message);
        }
        const { rows, data } = accounts;
        const successed = () => resolve({ handleCount, errorCount, reasons });
        if (rows === 0) {
            successed();
            return;
        }
        const arr = [];
        Array.from(data).forEach(obj => {
            const { gameIds, ...newObj } = obj;
            gameIds && (gameIds + '').split(',').forEach(gameId => arr.push({ gameId: gameId.trim(), ...newObj }));
        })
        const executor = new Executor(successed, reject);
        arr.forEach(obj => {
            const { uid, token, gameId } = obj;
            executor.submit((resolve_) => {
                kuroGameSign(uid, token, gameId).then(msg => {
                    __log.info(`[Kuro Game Sign] ${uid} => ${msg}`);
                    handleCount++;
                    resolve_();
                }).catch(e => {
                    __log.info(`[Kuro Game Sign] ${uid} => ${e.msg ?? e.message}`);
                    handleCount++;
                    errorCount++;
                    reasons.push(`${uid} => ${e.msg ?? e.message}`);
                    resolve_();
                })
            })
        })
        executor.start();
    })
}

export {
    kuroSDKLogin,
    kuroTokenLogin,
    kuroLogout,
    kuroSignGameUpdate,
    kuroGameSign,
    kuroGameSignAll
}