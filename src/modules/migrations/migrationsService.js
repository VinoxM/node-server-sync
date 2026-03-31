import fs from 'fs';
import path from 'path';
import migrationsRep from './migrationsRep.js';

async function lookupExecutable() {
    const executableSqlScripts = {}
    const executionPath = __env.get('sqlite.executionPath')
    if (__isNotBlank(executionPath)) {
        const folder = __join(executionPath)
        const files = fs.readdirSync(folder, { recursive: true })
        for (const file of files) {
            const fullPath = path.join(folder, file)
            if (fs.lstatSync(fullPath).isFile() && path.extname(fullPath) === '.sql') {
                const basename = path.basename(file)
                const dbName = basename.split("_")[0];
                const sort = parseInt(basename.substring(0, basename.length - 4).split('.').pop()?.replace('sort_', ''))
                if (Number.isNaN(sort)) {
                    __log.warn(`[Migrations] The SQL script file ${file} is invalid. Please use dbName_xxxx.sort_N.sql instead.`)
                    continue;
                }
                const exists = await migrationsRep.selectExists(file).then(({ exists }) => Boolean(exists))
                if (!exists) {
                    executableSqlScripts[dbName] ??= []
                    executableSqlScripts[dbName].push({ file: fullPath, fileName: file, sort })
                }
            }
        }
    } else {
        __log.warn(`[Migrations] sqlite.executionPath is empty, skipped.`)
    }
    return executableSqlScripts
}

function backupDatabase(dbName) {
    const dbPath = __join(__env.get('sqlite.dbPath'))
    const dbFile = `${dbName}.db`
    const sourceFile = path.join(dbPath, dbFile)
    const backupPath = path.join(dbPath, 'backup')
    const backupDbName = dbFile + `.bak_${Date.now()}`
    const backupFile = path.join(backupPath, backupDbName)
    fs.copyFileSync(sourceFile, backupFile)
    return { fileName: backupDbName, file: backupFile, sourceFile }
}

function removeBackupDatabase(file) {
    try {
        fs.unlinkSync(file)
    } catch (ignored) {
    }
}

function restoreBackupDatabase(file, sourceFile) {
    try {
        fs.existsSync(sourceFile) && fs.unlinkSync(sourceFile)
        fs.renameSync(file, sourceFile)
    } catch (ex) {
        __log.error(`[Migrations] Restore backup database failed, exit the progress.`, ex)
        process.exit(1)
    }
}

export async function doMigrations() {
    const sqlScripts = await lookupExecutable()
    const dbNames = Object.keys(sqlScripts)
    if (dbNames.length === 0) return
    for (const dbName of dbNames) {
        const scripts = sqlScripts[dbName]?.sort((a, b) => a.sort - b.sort);
        const backup = backupDatabase(dbName);
        __log.info(`[Migrations] Ready to execute database ${dbName} sql scripts, backup database: ${backup.file}.`)
        const executionResult = [];
        let anyFailed = false;
        await __sqliteDB.getTransactionDB(async db => {
            for (const { file, fileName } of scripts) {
                let failedReason = null;
                let sqlContent = null;
                try {
                    __log.info(`[Migrations] Ready to execute sql script: ${fileName}, use database: ${dbName}.`)
                    sqlContent = fs.readFileSync(file).toString();
                    await db.execute(sqlContent);
                    __log.info(`[Migrations] Execute sql script: ${fileName} success.`)
                } catch (err) {
                    failedReason = err?.stack ?? err?.message ?? 'Unknown failed.'
                    anyFailed = true;
                    __log.error(`[Migrations] Execute sql script: ${fileName} failed. Cause: ${err?.message ?? 'Unknown failed.'}`)
                } finally {
                    executionResult.push({ failedReason, file, fileName, fileContent: sqlContent })
                }
            }
        }, err => {
            anyFailed = true;
            __log.error(`[Migrations] Execute database ${dbName} sql scripts failed.`, err?.message ?? err)
        }, dbName)
        try {
            for (const { failedReason, fileName, fileContent } of executionResult) {
                await migrationsRep.insertOne(fileName, fileContent, failedReason, backup.fileName)
            }
        } catch (ex) {
            anyFailed = true;
            __log.error(`[Migrations] Save execution result failed.`, ex)
        }
        if (!anyFailed) {
            __log.info(`[Migrations] Execute database ${dbName} sql scripts success, remove backup database.`)
            removeBackupDatabase(backup.file)
        } else {
            __log.info(`[Migrations] Execute database ${dbName} sql scripts failed, restore backup database.`)
            restoreBackupDatabase(backup.file, backup.sourceFile)
        }
    }
}