# Magic Book 云端档案与配置同步服务 (node-server 实施计划)

> 本文档为 `node-server` 扩展支持 `magic-book`（桌面端知识管理/桌面挂件）云端同步业务的完整实施路线图与技术契约指南。  
> 任何新介入的 AI Agent 或开发者在接手本任务时，请务必完整阅读本文档，严格遵循既有架构范式开展开发。

---

## 📖 一、背景与既有架构约束 (Context & Architecture)

### 1. 业务目标
为 `magic-book` 桌面应用提供多设备、多档案（Profile）及配置文档（Documents）的云端增量同步后端支撑，实现多设备互通、断网离线编辑恢复与防丢失。

### 2. 复用现有的基础设施（严禁重复造轮子）
- **开发运行时**：Node.js ESM 规范 (`type: "module"`)、Express 5。
- **账号与鉴权复用**：
  - 复用现有的 [`account`](file:///c:/Users/maou/Documents/workspace/gitea/node-server/src/modules/account) 模块与 `auth_user` 表（位于 `account.db`）。
  - 复用现有的登录认证路由与服务（[`authApi.js`](file:///c:/Users/maou/Documents/workspace/gitea/node-server/src/api/routes/account/authApi.js) / [`accountService.js`](file:///c:/Users/maou/Documents/workspace/gitea/node-server/src/modules/account/service/accountService.js)）。
  - 复用 [`authorizationFilter.js`](file:///c:/Users/maou/Documents/workspace/gitea/node-server/src/api/filters/authorizationFilter.js)：在路由中声明 `needAuth: true`，中间件会自动校验 Token 并将解码载荷注入到 `req.userInfo`（包含 `{ id, uname, clientId }`，其中 `req.userInfo.id` 即为用户的逻辑 `uid`）。
- **客户端接入配置**：
  - 在 [`resource/application-main.yaml`](file:///c:/Users/maou/Documents/workspace/gitea/node-server/resource/application-main.yaml) 的 `auth.allowedClients` 列表中添加 `magic-book-desktop` 客户端配置项（包含 `id`, `secret`, `maxTokenStore`）。
- **数据库操作规范**：
  - 采用全局 `__sqliteDB`（基于 [`@libsql/client`](file:///c:/Users/maou/Documents/workspace/gitea/node-server/src/core/database/libSqlDB.js) 的 LibSql 驱动）。
  - 所有 Repository 均通过指定 `dbName` 操作对应的 SQLite 逻辑库，如 `__sqliteDB.query(sql, params, null, dbName)`。

### 3. 数据库归属决策（多库隔离架构）
- **归属库**：新建专属于 `magic-book` 的逻辑业务库 **`magic_book`**（物理对应 `magic_book.db`）。
- **设计依据**：
  - `node-server` 采用按业务领域分库机制（如 `anime.db`、`media.db`、`account.db`）。
  - 同步流水日志（`sync_changelog`）和快照内容（`sync_documents`）体积增长迅速且读写高频，物理隔离可防止全局 `account.db` 体积膨胀，便于未来做单独的数据压缩（`VACUUM`）与归档清理。
  - 业务表通过 `uid` 字段逻辑弱关联 `auth_user.id`，不依赖跨库物理外键。

---

## 🗄️ 二、数据库 DDL 规范 (`resource/application-sqlite.yaml`)

在 `resource/application-sqlite.yaml` 中新增 `magic_book` 配置段，由底层服务启动时自动检查并建表：

```yaml
sqlite:
  db:
    magic_book:
      # 1. 客户端设备与会话状态表
      - tableName: sync_devices
        DDL: |
          CREATE TABLE sync_devices (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `uid` INTEGER NOT NULL,
            `device_id` VARCHAR(64) NOT NULL,
            `device_name` VARCHAR(100) NOT NULL,
            `platform` VARCHAR(32) NOT NULL,
            `last_active_time` DATETIME NOT NULL,
            `create_time` DATETIME NOT NULL,
            CONSTRAINT `idx_sync_devices_uid_device` UNIQUE (`uid`, `device_id`)
          );
          CREATE INDEX `idx_sync_devices_uid` ON sync_devices(`uid`);

      # 2. 档案元数据表 (对应客户端 profiles)
      - tableName: sync_profiles
        DDL: |
          CREATE TABLE sync_profiles (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `uid` INTEGER NOT NULL,
            `profile_id` VARCHAR(64) NOT NULL,
            `label` VARCHAR(100) NOT NULL DEFAULT '',
            `is_default` INTEGER NOT NULL DEFAULT 0,
            `is_deleted` INTEGER NOT NULL DEFAULT 0,
            `version` INTEGER NOT NULL DEFAULT 1,
            `update_time` DATETIME NOT NULL,
            `create_time` DATETIME NOT NULL,
            CONSTRAINT `idx_sync_profiles_uid_profile` UNIQUE (`uid`, `profile_id`)
          );
          CREATE INDEX `idx_sync_profiles_uid` ON sync_profiles(`uid`);

      # 3. 配置文档最新态快照表 (CQRS 读侧视图)
      - tableName: sync_documents
        DDL: |
          CREATE TABLE sync_documents (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `uid` INTEGER NOT NULL,
            `scope` VARCHAR(20) NOT NULL,
            `profile_id` VARCHAR(64) NOT NULL DEFAULT '',
            `name` VARCHAR(64) NOT NULL,
            `value` TEXT NOT NULL,
            `version` INTEGER NOT NULL DEFAULT 1,
            `last_device_id` VARCHAR(64) DEFAULT NULL,
            `is_deleted` INTEGER NOT NULL DEFAULT 0,
            `update_time` DATETIME NOT NULL,
            CONSTRAINT `idx_sync_docs_unique` UNIQUE (`uid`, `scope`, `profile_id`, `name`)
          );
          CREATE INDEX `idx_sync_docs_lookup` ON sync_documents(`uid`, `scope`, `profile_id`, `name`);

      # 4. 单调递增变更流水表 (增量同步核心引擎)
      - tableName: sync_changelog
        DDL: |
          CREATE TABLE sync_changelog (
            `cursor` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `uid` INTEGER NOT NULL,
            `device_id` VARCHAR(64) NOT NULL,
            `entity_type` VARCHAR(20) NOT NULL,
            `scope` VARCHAR(20) DEFAULT NULL,
            `profile_id` VARCHAR(64) NOT NULL DEFAULT '',
            `name` VARCHAR(64) DEFAULT NULL,
            `value` TEXT DEFAULT NULL,
            `is_deleted` INTEGER NOT NULL DEFAULT 0,
            `client_timestamp` BIGINT NOT NULL,
            `create_time` DATETIME NOT NULL
          );
          CREATE INDEX `idx_sync_changelog_scan` ON sync_changelog(`uid`, `cursor` ASC);
          CREATE INDEX `idx_sync_changelog_clean` ON sync_changelog(`create_time`);
```

---

## 📡 三、API 接口定义与协议契约 (API Specifications)

所有接口统一基于 `node-server` 的 [`defineRoutes`](file:///c:/Users/maou/Documents/workspace/gitea/node-server/src/utils/defineUtil.js) 风格进行编写，所有业务路由均配置 `needAuth: true`，并在回调内通过 `req.userInfo.id` 取出 `uid`。

### 1. 设备管理 (`/magic-book/device/*`)
- **`POST /magic-book/device/register`**
  - **参数**：`{ device_id: string, device_name: string, platform: string }`
  - **行为**：存在则更新 `last_active_time` 与 `device_name`，不存在则新增记录。
- **`POST /magic-book/device/list`**
  - **参数**：`{}`
  - **返回**：当前用户下所有的登记设备列表。

### 2. 档案管理 (`/magic-book/profile/*`)
- **`POST /magic-book/profile/list`**
  - **参数**：`{}`
  - **返回**：当前用户的所有非删除状态的档案元数据（`profile_id`, `label`, `is_default`, `version`, `update_time`）。
- **`POST /magic-book/profile/create`**
  - **参数**：`{ profile_id: string, label: string, is_default?: boolean }`
  - **行为**：在 `sync_profiles` 中新增档案，同时向 `sync_changelog` 追加一条 `entity_type='profile'` 的创建流水。
- **`POST /magic-book/profile/rename`**
  - **参数**：`{ profile_id: string, label: string }`
  - **行为**：更新档案名称，递增 `version`，追加流水记录。
- **`POST /magic-book/profile/delete`**
  - **参数**：`{ profile_id: string }`
  - **行为**：软删除档案（`is_deleted=1`），追加墓碑删除流水。

### 3. 同步核心引擎 (`/magic-book/sync/*`)
- **`POST /magic-book/sync/pull` (增量拉取)**
  - **请求参数**：
    ```json
    {
      "cursor": 1042,        // 客户端本地当前保存的最大游标（初次全量传 0）
      "limit": 100           // 单次最大拉取行数（默认 100，上限 500）
    }
    ```
  - **响应格式**：
    ```json
    {
      "has_more": false,
      "next_cursor": 1045,
      "changes": [
        {
          "cursor": 1043,
          "entity_type": "document",
          "scope": "profile",
          "profile_id": "work",
          "name": "pendantPreferences",
          "value": "{\"scale\":1.2}",
          "is_deleted": 0
        }
      ]
    }
    ```
- **`POST /magic-book/sync/push` (变更提交)**
  - **请求参数**：
    ```json
    {
      "device_id": "c1f7b8e2-4b2a-4c28-98e3-0d5b4a92c011",
      "changes": [
        {
          "entity_type": "document",
          "scope": "profile",
          "profile_id": "work",
          "name": "pendantPreferences",
          "value": "{\"scale\":1.2}",
          "is_deleted": 0,
          "client_timestamp": 1730518800000
        }
      ]
    }
    ```
  - **服务端事务执行保障 (ACID)**：
    1. 开启事物 `BEGIN`；
    2. 遍历 `changes`：
       - **更新快照表**：对 `sync_documents` 进行 Upsert 写入，更新 `version = version + 1`, `update_time = NOW()`, `last_device_id`；
       - **追加流水表**：向 `sync_changelog` 插入记录，获得自增 `cursor`；
    3. 刷新 `sync_devices` 对应设备的 `last_active_time`；
    4. 提交事务 `COMMIT`；
    5. 返回客户端最新的全局流水游标 `latest_cursor`。
- **`POST /magic-book/sync/snapshot` (基准快照全量获取)**
  - **适用场景**：新设备接入、本地数据重置或断网超期（本地 Cursor 被服务器清理）。
  - **请求参数**：`{ profile_id?: string }`
  - **返回**：当前 `sync_documents` 中所有未删除文档的最新全量键值集合，以及当前的最高流水 `server_cursor`。

---

## 🏗️ 四、代码模块分层架构与目录规划

```
node-server/
├── resource/
│   ├── application-sqlite.yaml      # [配置更新] 添加 magic_book 库及 4 张表 DDL
│   └── application-main.yaml        # [配置更新] auth.allowedClients 中增加 magic-book-desktop
└── src/
    ├── api/
    │   └── routes/
    │       └── magicBook/           # [新增] API 控制器层
    │           ├── deviceApi.js     # /magic-book/device/* 路由定义
    │           ├── profileApi.js    # /magic-book/profile/* 路由定义
    │           └── syncApi.js       # /magic-book/sync/* 增量同步核心路由
    └── modules/
        └── magicBook/               # [新增] 核心业务模块
            ├── constants/
            │   └── magicBookConst.js # 常量定义（作用域、实体类型等）
            ├── repository/          # [新增] 数据访问层 (dbName = 'magic_book')
            │   ├── syncDeviceRep.js
            │   ├── syncProfileRep.js
            │   ├── syncDocumentRep.js
            │   └── syncChangelogRep.js
            └── service/             # [新增] 业务逻辑层
                ├── syncDeviceService.js
                ├── syncProfileService.js
                └── syncService.js   # 事务处理、Cursor 管理、Compaction 清理任务
```

---

## 📋 五、实施任务清单 (Milestones & Checklist)

任何后续接手的开发会话，请依次按阶段完成下列任务并在方框中标记 `[x]`：

### Phase 1: 基础设施与数据定义配置
- [x] 1.1 在 `resource/application-sqlite.yaml` 中增加 `magic_book` 库与 4 张表的 DDL（`sync_devices`, `sync_profiles`, `sync_documents`, `sync_changelog`）。
- [x] 1.2 在 `resource/application-main.yaml` 中的 `auth.allowedClients` 添加客户端配置项（例如 `id: magic-book-desktop`，配置 `maxTokenStore: 10` 等）。
- [x] 1.3 启动/重启 `node-server` 服务测试，观察控制台确保 `[Sqlite] Loaded database schema: magic_book` 正常输出，表成功初始化。

### Phase 2: Repository 数据持久层开发
- [x] 2.1 创建 `src/modules/magicBook/repository/syncDeviceRep.js`，实现设备的按 uid 查询、更新活动时间与 Upsert。
- [x] 2.2 创建 `src/modules/magicBook/repository/syncProfileRep.js`，实现档案的增删改查与软删除。
- [x] 2.3 创建 `src/modules/magicBook/repository/syncDocumentRep.js`，实现文档快照查询、基于 `(uid, scope, profile_id, name)` 的 Upsert。
- [x] 2.4 创建 `src/modules/magicBook/repository/syncChangelogRep.js`，实现 `SELECT ... WHERE cursor > ?` 范围扫描以及流水追加。

### Phase 3: Service 业务服务层与事务实现
- [x] 3.1 创建 `src/modules/magicBook/service/syncDeviceService.js`，实现设备登记与列表获取。
- [x] 3.2 创建 `src/modules/magicBook/service/syncProfileService.js`，实现档案创建、重命名、删除及伴随变更流水记录。
- [x] 3.3 创建 `src/modules/magicBook/service/syncService.js`：
  - 实现 `pullChanges(uid, cursor, limit)` 逻辑；
  - 实现 `pushChanges(uid, deviceId, changes)` 逻辑，使用事务保证状态表更新与流水表追加原子性；
  - 实现 `getBaselineSnapshot(uid, profileId)` 全量基线导出；
  - 编写历史增量日志归档修剪定时清理任务（可选定时清理 30 天前旧流水）。

### Phase 4: API 路由与拦截器接入
- [x] 4.1 创建 `src/api/routes/magicBook/deviceApi.js`，配置 `basePath: '/magic-book/device'`，注入鉴权与参数校验。
- [x] 4.2 创建 `src/api/routes/magicBook/profileApi.js`，配置 `basePath: '/magic-book/profile'`。
- [x] 4.3 创建 `src/api/routes/magicBook/syncApi.js`，配置 `basePath: '/magic-book/sync'`，开放 `pull`, `push`, `snapshot` 接口。
- [x] 4.4 检查自动路由扫描机制，确认新增路由已注册并能在 Express 路由表中正常挂载。

### Phase 5: 验证、自动化测试与联调
- [x] 5.1 编写单元测试或集成测试脚本，模拟未授权（401）访问拦截。
- [x] 5.2 模拟两个客户端设备（Device A 与 Device B）：
  - Device A 登录并提交 push 一条变更；
  - Device B 以 cursor=0 拉取 pull，验证能准确拉取该条记录且游标递增；
  - Device B 本地修改并再次 push，验证多设备交替写入时版本号与流水单调递增。
- [x] 5.3 检查 ESLint 代码风格并执行构建/重启确认无任何报错。
