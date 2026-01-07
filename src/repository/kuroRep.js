const dbName = 'kuro';

const enablePrint = { print: true }

export default {
    selectTokenByUid: (uid) => {
        const sql = 'SELECT token FROM kuro_community_account WHERE uid=?';
        return sqliteDB.selectOne(sql, [uid], null, dbName).then(obj => obj?.token);
    },
    insertOrUpdateAccount: ({ uid, token }) => {
        const sql = 'REPLACE INTO kuro_community_account(uid, token) VALUES(?,?)';
        return sqliteDB.insert(sql, [uid, token], enablePrint, dbName);
    },
    deleteAccountByUid: (uid) => {
        const sql = 'DELETE FROM kuro_community_account WHERE uid=?';
        return sqliteDB.delete(sql, [uid], enablePrint, dbName);
    },
    selectSignGamesByUid: (uid) => {
        const sql = 'SELECT game_ids gameIds FROM kuro_game_sign WHERE uid=?';
        return sqliteDB.selectOne(sql, [uid], null, dbName).then(obj => obj?.gameIds);
    },
    insertOrUpdateSignGames: ({ uid, games }) => {
        const sql = 'REPLACE INTO kuro_game_sign(uid, game_ids) VALUES(?, ?)';
        return sqliteDB.insert(sql, [uid, games], enablePrint, dbName);
    },
    selectAllSignAccount: () => {
        const sql = 'SELECT ac.uid,ac.token,si.game_ids gameIds ' +
            'FROM kuro_community_account ac ' +
            'LEFT JOIN kuro_game_sign si ON ac.uid=si.uid';
        return sqliteDB.selectAll(sql, [], null, dbName);
    }
}