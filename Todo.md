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

---

## 👤 六、用户基础资料扩展与头像存储实施方案 (User Profile & Avatar Storage Plan)

### 1. 业务目标与设计准则
- **业务目标**：在现有认证机制基础上，为 `account` 模块扩展用户资料详情管理（昵称、邮箱、手机号、性别、简介、个性化扩展）及自定义头像上传与储存服务。
- **核心准则**：
  - **分表隔离原则**：`auth_user` 表保持纯粹（仅存账号密码认证信息），新增 `user_profile` 承载可公开及易变的用户资料，从根源上杜绝查询用户资料时密码哈希外泄的风险。
  - **严禁二进制入库**：图片等非结构化文件禁止以 BLOB 或 Base64 存入 SQLite，统一存储至系统既有的 MinIO 对象存储，数据库仅保存相对路径。
  - **标准规格与极致压缩**：服务端通过 `sharp` 强制归一化转码为 `256×256` 的 `.webp` 格式，质量系数设为 80，体积压至 20~40KB。
  - **前后端协同体验**：前端提供交互式自由缩放与移动裁切弹窗（如 Cropper 方案）；服务端负责合规性校验、安全防伪与强制规格转码兜底。

### 2. 数据库 DDL 规范 (`resource/application-sqlite.yaml`)
在 `account` 库中新增 `user_profile` 表配置：

```yaml
sqlite:
  db:
    account:
      # 新增用户资料详情表 (逻辑弱关联 auth_user.id)
      - tableName: user_profile
        DDL: |
          CREATE TABLE user_profile (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `uid` INTEGER NOT NULL,
            `nickname` VARCHAR(50) DEFAULT NULL,
            `avatar` VARCHAR(255) DEFAULT NULL,
            `email` VARCHAR(100) DEFAULT NULL,
            `phone` VARCHAR(20) DEFAULT NULL,
            `gender` INTEGER NOT NULL DEFAULT 0,
            `bio` VARCHAR(255) DEFAULT '',
            `extra` TEXT DEFAULT NULL,
            `update_time` DATETIME NOT NULL,
            `create_time` DATETIME NOT NULL,
            CONSTRAINT `idx_user_profile_uid` UNIQUE (`uid`)
          );
          CREATE INDEX `idx_user_profile_email` ON user_profile(`email`);
```

### 3. 头像存储与访问规范 (MinIO 架构)
- **Bucket 划分**：在 MinIO 中规划 `avatar`（或复用系统默认存储桶并在对象键加前缀）。
- **对象 Key 命名策略**：`avatar/{uid}/{timestamp}.webp`（携带时间戳作为文件名，天然规避浏览器强缓存导致头像更新不及时的问題）。
- **生命周期清理**：用户更换头像时，异步调用 `minioClient.deleteObject` 清理用户在 MinIO 中的历史头像，避免孤儿文件长期堆积。
- **缺省兜底策略**：用户尚未上传头像且已绑定邮箱时，自动回退到 Cravatar / Gravatar 国内加速源 (`https://cravatar.cn/avatar/{md5(email)}?d=identicon`)。

### 4. 图像转码与压缩实现规范 (`sharp`)
- **技术选型**：使用 `sharp` 库（底层基于 `libvips` C 库，单张头像转码耗时 $\le 15\text{ms}$，自带主流架构预编译二进制）。
- **转码管道配置**：
  - 自动校正 EXIF 旋转角度（`.rotate()`）。
  - 居中安全裁切填充（`.resize(256, 256, { fit: 'cover', position: 'center' })`）。
  - WebP 编码压缩（`.webp({ quality: 80, alphaQuality: 85, effort: 4 })`）。
  - 输出 `Buffer` 直接对接现有 `minioClient.putObject`。

### 5. API 接口定义与协议契约
- **`POST /account/profile/get`** (获取个人详细资料)
  - 鉴权：`needAuth: true`，提取 `req.userInfo.id` 作为 `uid`。
  - 返回：`{ uid, uname, nickname, avatar, email, phone, gender, bio, extra }`。
- **`POST /account/profile/update`** (更新个人基本资料)
  - 鉴权：`needAuth: true`。
  - 请求参数：`{ nickname?: string, email?: string, phone?: string, gender?: number, bio?: string, extra?: string|object }`。
- **`POST /account/avatar/upload`** (上传并设置新头像)
  - 鉴权：`needAuth: true`。
  - 请求体格式：`multipart/form-data`（字段名为 `avatar` 或第一附件）。
  - 校验：大小限制 $\le 5\text{MB}$，MIME 限制为 JPG / PNG / WEBP / GIF。
  - 响应：`{ avatar: string, size: number }`。

### 6. 实施任务清单 (Milestones & Checklist - Phase 6)
- [ ] 6.1 安装 `sharp` 依赖并创建 `src/common/utils/imageUtil.js` 图像处理工具函数。
- [ ] 6.2 在 `resource/application-sqlite.yaml` 中增加 `user_profile` 表 DDL，并于 `resource/execution/` 创建迁移脚本保证平滑热更新。
- [ ] 6.3 创建 `src/modules/account/repository/userProfileRep.js`，实现用户资料查询、Upsert 与头像路径更新。
- [ ] 6.4 创建 `src/modules/account/service/userProfileService.js`，实现资料读写、头像裁切压缩、MinIO 上传与旧头像异步清理。
- [ ] 6.5 创建 `src/api/routes/account/profileApi.js`，开放资料查询、更新及头像上传接口。
- [ ] 6.6 编写端到端自动化测试脚本，验证鉴权拦截、大图转码为 256×256 WebP、体积压缩达标及 MinIO 存储闭环。



---

## 📱 七、客户端设备授权吊销与下线方案 (Client Device Revocation & Token Lifecycle Plan)

### 1. 业务目标与设计准则
- **业务目标**：支持客户端远程移除指定设备的授权，实现该设备会话的即刻失效与增量同步拦截，构建设备全生命周期安全闭环。
- **核心准则**：
  - **元数据与凭证级联销毁**：不能仅在数据库中删除设备记录，必须同时级联注销该设备所持有的会话 Token（从 Redis 与内存哈希表中彻底清除），确保该设备发起的后续请求立即被 `authorizationFilter` 拒收并返回 401。
  - **纵深防御拦截**：在增量变更提交（`pushChanges`）等敏感业务入口，增加对请求设备合法性的核验兜底，防止已移除设备死灰复燃。
  - **接口幂等与操作容错**：移除不存在的设备或已被移除的设备应保持幂等成功返回，避免客户端产生误报。

### 2. 数据库与持久层设计
- **`sync_devices` 扩展字段与迁移**：
  - 在 `resource/application-sqlite.yaml` 的 `sync_devices` 表 DDL 中新增 `token_hash VARCHAR(64) DEFAULT NULL` 字段（记录该设备当前持有的有效 Token 句柄），并生成对应的热迁移脚本。
- **数据访问仓库 (`src/modules/magicBook/repository/syncDeviceRep.js`)**：
  - 新增 `deleteDevice(uid, deviceId, tx)`：执行 `DELETE FROM sync_devices WHERE uid = ? AND device_id = ?`。
  - 改造 `upsertDevice`：在登记设备时支持持久化 `token_hash`。

### 3. 业务服务层设计 (`src/modules/magicBook/service/syncDeviceService.js`)
- **`registerDevice(uid, deviceData, tokenHash)` 改造**：
  - 接收控制器解析出的当前请求 `tokenHash`，在 Upsert 写入 `sync_devices` 时一并绑定。
- **`removeDevice(uid, deviceId)` 新增**：
  1. 校验入参 `uid` 和 `deviceId`。
  2. 查询指定设备记录，提取其关联的 `token_hash`。
  3. 若存在有效 `token_hash`，调用 `deleteToken(tokenHash)`（底层调用 `authorizationStore.deleteToken`，原子清除 Redis 与二级内存缓存）。
  4. 调用 `syncDeviceRep.deleteDevice(uid, deviceId)` 移除数据库设备记录。
  5. 返回 `{ success: true }`。

### 4. API 路由与协议契约 (`src/api/routes/magicBook/deviceApi.js`)
- **`POST /magic-book/device/remove`** (移除设备授权)
  - 鉴权配置：
    - `method: POST`
    - `needAuth: needAuthSingleClient.MAGIC_BOOK`
    - `needSecret: () => 'mAou5820.magic-book'`
  - 请求参数：`{ device_id: string }`
  - 前置校验：`preCheck: req => checkBodyKeysNotBlank(req, ['device_id'])`
  - 响应结果：`{ code: 0, data: { success: true }, msg: "ok" }`

### 5. 同步写入入口防穿透校验 (`syncService.js`)
- 在 `pushChanges(uid, deviceId, changes)` 事务前置逻辑中：
  - 查询 `syncDeviceRep.selectDevice(uid, deviceId)`，若设备不存在或已被吊销，立即抛出 `__throwMessage('Device authorization has been revoked.', -401, 401)`，阻断写入。

### 6. 实施任务清单 (Milestones & Checklist - Phase 7)
- [x] 7.1 在 `resource/application-sqlite.yaml` 的 `sync_devices` 表中添加 `token_hash` 字段并在 `resource/execution/` 补充迁移文件。
- [x] 7.2 在 `src/modules/magicBook/repository/syncDeviceRep.js` 中实现 `deleteDevice(uid, deviceId)` 方法，并在 `upsertDevice` 中支持 `token_hash`。
- [x] 7.3 在 `src/modules/magicBook/service/syncDeviceService.js` 中扩展 `registerDevice` 绑定 `tokenHash`，并实现 `removeDevice(uid, deviceId)` 级联销毁 Token。
- [x] 7.4 在 `src/api/routes/magicBook/deviceApi.js` 中新增 `/remove` 路由并补充参数非空校验。
- [x] 7.5 在 `src/modules/magicBook/service/syncService.js` 的 `pushChanges` 中补充设备存在性校验。
- [x] 7.6 编写端到端单元测试与集成测试，验证设备移除后其持有的旧 Token 发送请求直接返回 401。

---

## 🔔 八、通知中心（Notification）多事件体系与载荷扩展方案 (Notification Multi-Event & Payload Enhancement Plan)

### 1. 业务目标与设计准则
- **业务目标**：打破目前通知系统单一字符串传输局限，全面支持结构化多事件（Event）模型，盘活 `extra` 上下文载荷，打通与 `magic-book` 桌面端 Notification Studio 动态模板的无缝联动。
- **核心准则**：
  - **精简核心列，拒绝字段臃肿**：仅将高频索引、事件路由必需的 `event` 和通用摘要 `title` 升格为主表列；级别（`level`）、状态（`status`）、动作链接等多样化属性统一收口至 `extra` JSON 载荷中，避免数据库 schema 膨胀。
  - **盘活并打通 `extra` 传输链路**：修正历史实现中按游标增量查询时剔除 `extra` 的缺陷，打通 `pushNotification` 结构化入参 -> 持久化存储 -> 实时 WebSocket 广播 -> 断线重连历史拉取的全链路数据完整性。
  - **向下绝对平滑兼容**：保留对原有 `pushNotification(message: string, createBy?: string)` 字符串调用形式的原生兼容，默认将普通文本标记为 `event='message'`，确保已有业务零破坏性平滑升级。

### 2. 数据库 DDL 规范与平滑迁移
- **表变更定义 (`resource/application-sqlite.yaml`)**：
  在 `socket.channel_notification` 增加 `event` 与 `title` 字段：
  ```yaml
      socket:
        - tableName: channel_notification
          DDL: |
            CREATE TABLE channel_notification (
              `id` integer PRIMARY KEY NOT NULL,
              `channel` varchar(50) NOT NULL,
              `event` varchar(50) NOT NULL DEFAULT 'message',
              `title` varchar(200) DEFAULT NULL,
              `message` varchar(5000),
              `extra` varchar(5000),
              `create_by` varchar(100) NOT NULL,
              `create_time` datetime NOT NULL
            )
  ```
- **热迁移增量脚本** (`resource/execution/{timestamp}/notification_alter_channel_notification.sort_1.sql`)：
  ```sql
  ALTER TABLE channel_notification ADD COLUMN `event` VARCHAR(50) NOT NULL DEFAULT 'message';
  ALTER TABLE channel_notification ADD COLUMN `title` VARCHAR(200) DEFAULT NULL;
  CREATE INDEX IF NOT EXISTS `idx_channel_notification_event` ON channel_notification(`event`);
  ```

### 3. 持久层与业务服务层改造
- **仓储层 (`src/modules/notification/repository/notificationRep.js`)**：
  - `insertNotification({ channel, event, title, message, extra, createBy })`：支持结构化入参写入，`extra` 支持对象自动 `JSON.stringify` 存储。
  - `selectNotification({ channel, lastId, event }, limit)`：查询字段补齐 `event`, `title`, `extra`，支持可选的 `event` 条件过滤与索引加速。
- **服务层 (`src/modules/notification/service/notificationService.js`)**：
  - `storeNotification(data)`：兼容校验字符串消息或结构化事件对象（至少存在 `message` 或 `event` 之一）。
  - `getNotification(channel, lastId, limit, event)`：向下透传查询条件。

### 4. WebSocket 通道与广播升级 (`src/api/sockets/notification.js`)
- **`pushNotification(payload, createBy)` 入参重载与广播**：
  - 允许传入 `string` 或 `{ event?: string, title?: string, message?: string, extra?: Record<string, any> }`。
  - 广播 Payload 格式：`{ id: lastId, event, title, message, extra, createTime, createBy }`。
- **`sendNotificationByLastId(client, lastId)` 历史恢复打通**：
  - 移除对 `extra` 的解构剥离，对 `extra` 进行 JSON 解析（若是字符串）后完整下发，保证断线重连拉取到的历史消息与实时广播具备一致的字段结构。

### 5. 现有业务调用示范重构
- **定时任务签到 (`kuroSignSchedule.js`)**：
  不再使用 `JSON.stringify` 塞入 `message`，改用：
  ```javascript
  pushNotification({
      event: 'kuro-game-sign',
      title: '库洛游戏每日自动签到',
      message: `签到成功 ${handleCount - errorCount} 个, 失败 ${errorCount} 个`,
      extra: { level: errorCount > 0 ? 'warn' : 'success', ...data }
  }, 'Schedule');
  ```
- **直播动态变动 (`biliveStreamService.js`)**：
  ```javascript
  pushNotification({
      event: 'bilive-stream',
      title: `${hostName} ${isStarted ? '开播啦' : '已下播'}`,
      message: title,
      extra: { hostName, roomId, isStarted, timestamp }
  }, 'BiliveService');
  ```

### 6. 实施任务清单 (Milestones & Checklist - Phase 8)
- [x] 8.1 在 `resource/application-sqlite.yaml` 中为 `channel_notification` 补充 `event` 和 `title` 字段，并在 `resource/execution/` 下编写标准增量迁移脚本。
- [x] 8.2 改造 `src/modules/notification/repository/notificationRep.js`，支持新字段读写与 `extra` 序列化。
- [x] 8.3 改造 `src/modules/notification/service/notificationService.js`，优化入参非空与格式校验。
- [x] 8.4 升级 `src/api/sockets/notification.js` 的 `pushNotification` 签名与广播，修复 `sendNotificationByLastId` 历史数据剥离 `extra` 的缺陷。
- [x] 8.5 改造 `kuroSignSchedule.js` 等典型业务调用点，采用新型事件模型进行通知推送。
- [x] 8.6 编写端到端单元测试，验证断线重连历史拉取与实时广播载荷的完整性。



---

## 🎯 待实施架构演进：Phase 9 (泛型二维作用域模型改造与多维配置同步升级 / Generic Scope Model & Multi-dimensional Sync Protocol)

> **背景与设计驱动力 (Background & Motivation)**：  
> 1. **消除服务端 Schema 频繁变更痛点**：当前云端配置文档快照表 `sync_documents` 与流水表 `sync_changelog` 固化了 `(uid, scope, profile_id, name)` 字段，当桌面端客户端演进增加新维度（如 `user` 账号级偏好、`org` 企业组织域、`device` 设备硬件域、`team` 团队协作域）时，服务端每次都需要修改表结构、增加列、执行 DDL 迁移并重构 Repository/Service。
> 2. **泛型二维作用域主键收敛**：通过将存储与协议统一升级为泛型二维主键 `(scope_type, scope_id, name)`，服务端彻底解耦具体的业务维度细节。无论未来客户端增加多少个配置作用域，服务端的表结构、SQL 仓储层与同步数据流转代码均可实现**终身零修改、零 DDL 迁移**。

### 1. 数据库 DDL 规范与平滑迁移 (`resource/application-sqlite.yaml`)

#### 1.1 `sync_documents` (配置文档快照表) 重构
将特定业务列 `scope` + `profile_id` 替换为通用的 `scope_type` + `scope_id`：
```yaml
      # 3. 配置文档最新态快照表 (泛型二维模型)
      - tableName: sync_documents
        DDL: |
          CREATE TABLE sync_documents (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `uid` INTEGER NOT NULL,
            `scope_type` VARCHAR(32) NOT NULL,
            `scope_id` VARCHAR(128) NOT NULL,
            `name` VARCHAR(64) NOT NULL,
            `value` TEXT NOT NULL,
            `version` INTEGER NOT NULL DEFAULT 1,
            `last_device_id` VARCHAR(64) DEFAULT NULL,
            `is_deleted` INTEGER NOT NULL DEFAULT 0,
            `update_time` DATETIME NOT NULL,
            CONSTRAINT `idx_sync_docs_unique` UNIQUE (`uid`, `scope_type`, `scope_id`, `name`)
          );
          CREATE INDEX `idx_sync_docs_lookup` ON sync_documents(`uid`, `scope_type`, `scope_id`, `name`);
```

#### 1.2 `sync_changelog` (增量变更流水表) 重构
```yaml
      # 4. 单调递增变更流水表 (泛型流水模型)
      - tableName: sync_changelog
        DDL: |
          CREATE TABLE sync_changelog (
            `cursor` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `uid` INTEGER NOT NULL,
            `device_id` VARCHAR(64) NOT NULL,
            `entity_type` VARCHAR(20) NOT NULL,
            `scope_type` VARCHAR(32) DEFAULT NULL,
            `scope_id` VARCHAR(128) DEFAULT NULL,
            `name` VARCHAR(64) DEFAULT NULL,
            `value` TEXT DEFAULT NULL,
            `is_deleted` INTEGER NOT NULL DEFAULT 0,
            `client_timestamp` BIGINT NOT NULL,
            `create_time` DATETIME NOT NULL
          );
          CREATE INDEX `idx_sync_changelog_scan` ON sync_changelog(`uid`, `cursor` ASC);
          CREATE INDEX `idx_sync_changelog_clean` ON sync_changelog(`create_time`);
```

#### 1.3 数据库平滑热迁移脚本 (`resource/execution/{timestamp}/magic_book_generic_scopes.sql`)
```sql
-- 1. 历史数据无损格式转换
-- 若存在旧列 scope, profile_id，转换规则：
--   若 scope = 'user' -> scope_type = 'user', scope_id = CAST(uid AS TEXT)
--   若 scope = 'profile' -> scope_type = 'profile', scope_id = uid || ':' || profile_id
--   若 scope = 'global' -> scope_type = 'global', scope_id = 'global'
```

### 2. API 协议契约升级 (`/magic-book/sync/*`)

#### 2.1 `POST /magic-book/sync/pull` (增量拉取)
- **响应载荷升级**：
  ```json
  {
    "has_more": false,
    "next_cursor": 1045,
    "changes": [
      {
        "cursor": 1043,
        "entity_type": "document",
        "scope_type": "profile",
        "scope_id": "1:work",
        "name": "pendantPreferences",
        "value": "{\"scale\":1.2}",
        "is_deleted": 0
      },
      {
        "cursor": 1044,
        "entity_type": "document",
        "scope_type": "user",
        "scope_id": "1",
        "name": "shortcuts",
        "value": "{\"bindings\":{}}",
        "is_deleted": 0
      }
    ]
  }
  ```
  *(注：保持向下兼容垫片，当检测到老客户端未传泛型字段时，服务端网关自动派生旧版 `scope` 与 `profile_id`)*

#### 2.2 `POST /magic-book/sync/push` (变更提交)
- **请求载荷升级**：
  ```json
  {
    "device_id": "c1f7b8e2-4b2a-4c28-98e3-0d5b4a92c011",
    "changes": [
      {
        "entity_type": "document",
        "scope_type": "profile",
        "scope_id": "1:work",
        "name": "pendantPreferences",
        "value": "{\"scale\":1.2}",
        "is_deleted": 0,
        "client_timestamp": 1730518800000
      }
    ]
  }
  ```

#### 2.3 `POST /magic-book/sync/snapshot` (全量快照获取)
- **请求参数**：支持可选的 `{ scope_type?: string, scope_id?: string }` 进行细粒度快照拉取。
- **返回数据**：基于泛型 `(scope_type, scope_id, name)` 聚合最新快照文档。

### 3. 持久层与服务层改造

#### 3.1 仓储层 (`src/modules/magicBook/repository/`)
- **`syncDocumentRep.js`**：
  - `selectDocuments(uid, { scopeType, scopeId, includeDeleted }, tx)`：更新查询字段与过滤条件；
  - `selectDocument(uid, scopeType, scopeId, name, tx)`：单项点查；
  - `upsertDocument({ uid, scopeType, scopeId, name, value, lastDeviceId, isDeleted }, tx)`：执行 UPSERT 写入。
- **`syncChangelogRep.js`**：
  - `insertChangelog` / `insertBatchChangelog`：记录写入 `scope_type`, `scope_id`。
  - `selectChangesAfterCursor`：返回标准化泛型实体流水。

#### 3.2 业务层 (`src/modules/magicBook/service/syncService.js`)
- 事务内批量处理 `changes`，更新快照并写入流水；
- 剥离所有对特定业务 `profile_id` 的专有代码分支，纯粹按泛型键值流转。

### 4. 实施任务清单 (Milestones & Checklist - Phase 9)
- [x] 9.1 更新 `resource/application-sqlite.yaml` 中 `sync_documents` 与 `sync_changelog` 表定义，编写增量热迁移 SQL。
- [x] 9.2 重构 `src/modules/magicBook/repository/syncDocumentRep.js`，将入参与字段升级为 `scopeType` 与 `scopeId`。
- [x] 9.3 重构 `src/modules/magicBook/repository/syncChangelogRep.js`，支持泛型流水字段读写。
- [x] 9.4 改造 `src/modules/magicBook/service/syncService.js`，适配新型 `pull`, `push`, `snapshot` 载荷与事务逻辑。
- [x] 9.5 在 `src/api/routes/magicBook/syncApi.js` 适配接口参数校验，并增加向下兼容性兜底垫片。
- [x] 9.6 编写端到端同步测试，验证新旧字段兼容、多作用域并发写入与流水游标推进一致性。
