import fs from 'fs';
import path from 'path';
import migrationsRep, { dbName as migrationsDbName } from './migrationsRep.js';

/**
 * 扫描并解析待执行的 SQL 迁移脚本列表
 * 脚本命名规范：`{dbName}_{description}.sort_{order}.sql` (例如 `account_create_table.sort_1.sql`)
 * 自动按目标数据库分组并过滤掉已经成功执行过的历史脚本
 * @returns {Promise<Record<string, Array<{ file: string, fileName: string, sort: number }>>>} 按 dbName 分组的待执行脚本列表
 */
async function lookupExecutable() {
    const executableSqlScripts = {};
    const executionPath = __env.get('sqlite.executionPath');
    if (__isNotBlank(executionPath)) {
        const folder = __join(executionPath);
        const files = fs.existsSync(folder) ? fs.readdirSync(folder, { recursive: true }) : [];
        for (const file of files) {
            const fullPath = path.join(folder, file);
            if (fs.lstatSync(fullPath).isFile() && path.extname(fullPath) === '.sql') {
                const basename = path.basename(file);
                const dbName = basename.split("_")[0];
                const sort = parseInt(basename.substring(0, basename.length - 4).split('.').pop()?.replace('sort_', '') ?? '');
                if (Number.isNaN(sort)) {
                    __log.warn(`[Migrations] The SQL script file ${file} is invalid. Please use dbName_xxxx.sort_N.sql instead.`);
                    continue;
                }
                const exists = await migrationsRep.selectExists(file).then(res => Boolean(res?.exists));
                if (!exists) {
                    executableSqlScripts[dbName] ??= [];
                    executableSqlScripts[dbName].push({ file: fullPath, fileName: file, sort });
                }
            }
        }
    } else {
        __log.warn(`[Migrations] sqlite.executionPath is empty, skipped.`);
    }
    return executableSqlScripts;
}

/**
 * 在执行迁移前对指定数据库进行快照物理备份
 * @param {string} dbName - 数据库名称
 * @returns {{ fileName: string, file: string, sourceFile: string }} 备份文件元数据
 */
function backupDatabase(dbName) {
    const dbPath = __join(__env.get('sqlite.dbPath'));
    const dbFile = `${dbName}.db`;
    const sourceFile = path.join(dbPath, dbFile);
    const backupPath = path.join(dbPath, 'backup');
    if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
    }
    const backupDbName = dbFile + `.bak_${Date.now()}`;
    const backupFile = path.join(backupPath, backupDbName);
    fs.copyFileSync(sourceFile, backupFile);
    return { fileName: backupDbName, file: backupFile, sourceFile };
}

/**
 * 迁移成功后删除临时备份文件
 * @param {string} file - 备份文件完整路径
 */
function removeBackupDatabase(file) {
    try {
        fs.unlinkSync(file);
    } catch (ignored) {
    }
}

/**
 * 迁移失败时从备份恢复原始数据库文件（回滚）
 * @param {string} file - 备份文件完整路径
 * @param {string} sourceFile - 原数据库目标文件完整路径
 */
function restoreBackupDatabase(file, sourceFile) {
    try {
        fs.existsSync(sourceFile) && fs.unlinkSync(sourceFile);
        fs.renameSync(file, sourceFile);
    } catch (ex) {
        __log.error(`[Migrations] Restore backup database failed, exit the progress.`, ex);
        process.exit(1);
    }
}

/**
 * 执行数据库自动化 SQL 脚本版本迁移
 * 1. 扫描未执行的 `.sql` 脚本
 * 2. 对受影响的库进行自动物理快照备份
 * 3. 在事务中按 `sort` 顺序依次执行脚本
 * 4. 记录迁移成功/失败日志与详情到 `execution` 库
 * 5. 若发生异常自动还原备份，若全部成功则自动清理备份
 * @returns {Promise<void>}
 */
export async function doMigrations() {
    const sqlScripts = await lookupExecutable();
    const dbNames = Object.keys(sqlScripts);
    if (dbNames.length === 0) return;

    for (const dbName of dbNames) {
        const scripts = sqlScripts[dbName]?.sort((a, b) => a.sort - b.sort);
        if (!scripts || scripts.length === 0) continue;

        await __sqliteDB.close(dbName);
        const backup = backupDatabase(dbName);
        await __sqliteDB.reconnect(dbName);
        __log.info(`[Migrations] Ready to execute database ${dbName} sql scripts, backup database: ${backup.file}.`);

        const executionResult = [];
        let anyFailed = false;
        let anyFailedReason = [];

        await __sqliteDB.getTransactionDB(async db => {
            for (const { file, fileName } of scripts) {
                let failedReason = null;
                let sqlContent = null;
                try {
                    __log.info(`[Migrations] Ready to execute sql script: ${fileName}, use database: ${dbName}.`);
                    sqlContent = fs.readFileSync(file).toString();
                    await db.execute(sqlContent);
                    __log.info(`[Migrations] Execute sql script: ${fileName} success.`);
                } catch (err) {
                    failedReason = err?.stack ?? err?.message ?? 'Unknown failed';
                    anyFailed = true;
                    const failedMessage = `Execute sql script: ${fileName} failed. Cause: ${err?.message ?? 'Unknown failed'}`;
                    anyFailedReason.push(failedMessage);
                    __log.error(`[Migrations] ${failedMessage}`);
                } finally {
                    executionResult.push({ failedReason, file, fileName, fileContent: sqlContent });
                }
            }
        }, err => {
            anyFailed = true;
            const failedMessage = `Execute database ${dbName} sql scripts failed. Cause: ${err?.message ?? 'Unknown failed'}`;
            anyFailedReason.push(failedMessage);
            __log.error(`[Migrations] ${failedMessage}`);
        }, dbName);

        const isSelfDb = dbName === migrationsDbName;
        try {
            isSelfDb && await __sqliteDB.reconnect(migrationsDbName);
            const anyFailedReasonStr = anyFailedReason.join(';\n');
            for (const { failedReason, fileName, fileContent } of executionResult) {
                const reason = anyFailed ? (failedReason ?? anyFailedReasonStr) : null;
                await migrationsRep.insertOne(fileName, fileContent, reason, backup.fileName);
            }
            isSelfDb && await __sqliteDB.close(migrationsDbName);
        } catch (ex) {
            anyFailed = true;
            __log.error(`[Migrations] Save execution result failed.`, ex);
        }

        if (!anyFailed) {
            __log.info(`[Migrations] Execute database ${dbName} sql scripts success, remove backup database.`);
            removeBackupDatabase(backup.file);
        } else {
            __log.info(`[Migrations] Execute database ${dbName} sql scripts failed, restore backup database.`);
            await __sqliteDB.close(dbName);
            restoreBackupDatabase(backup.file, backup.sourceFile);
            await __sqliteDB.reconnect(dbName);
        }

        isSelfDb && await __sqliteDB.reconnect(migrationsDbName);
    }
}