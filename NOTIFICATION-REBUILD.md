# Node-Server 通知中心业务事件重构方案 (NOTIFICATION-REBUILD)

> **设计原则**：  
> **按业务场景收敛事件（Domain-Level Event Aggregation），严禁过度拆分！**  
> 避免将同类业务拆为 `xxx-started`、`xxx-ended`、`xxx-failed` 等碎片化事件。统一采用业务领域标识作为主 `event`，具体动作、状态变更及生命周期流转统一收口至 `extra.action` 中传递。  
> **前端收益**：`magic-book` 桌面端只需为该业务域注册**一个** `messageHandler`（即单份 Vue 3 SFC 卡片组件），组件内部基于 `extra.action` 即可实现响应式多态渲染与徽标切换，大幅降低模板维护负担与配置开销。

---

## 📊 一、收敛后的核心事件注册表 (Unified Event Taxonomy)

| 业务领域 | 统一 `event` 名称 | 子动作 `extra.action` | 所在服务与文件位置 | 关键业务载荷 (`extra`) |
| :--- | :--- | :--- | :--- | :--- |
| **B站直播流状态** | `bilive-stream` | `started` / `ended` | [`src/modules/media/service/bilive/biliveStreamService.js`](./src/modules/media/service/bilive/biliveStreamService.js#L169) | `{ action, hostName, roomId, title, timestamp, isStarted }` |
| **媒体视频采集** | `media-crawl` | `created` / `skipped` | [`src/modules/media/service/crawl/hanime1/index.js`](./src/modules/media/service/crawl/hanime1/index.js#L77) | `{ source: 'hanime1', action: 'created', count, videos }` |
| **番剧 RSS 下载任务** | `anime-rss-task` | `added` / `completed` / `resolve-failed` | [`src/modules/anime/service/rss/rssTaskService.js`](./src/modules/anime/service/rss/rssTaskService.js#L108) | `{ action, uuid, resultId, title, level }` |
| **番剧 RSS 订阅扫描** | `anime-rss-subscribe`| `updated` | [`src/modules/anime/service/rss/rssScheduleService.js`](./src/modules/anime/service/rss/rssScheduleService.js#L177) | `{ action: 'updated', effectRows, handledCount, updated }` |
| **Bangumi 封面同步** | `bangumi-image` | `sync-complete` | [`src/modules/anime/service/bangumi/bangumiImagesService.js`](./src/modules/anime/service/bangumi/bangumiImagesService.js#L120) | `{ action: 'sync-complete', complete, failed, total }` |
| **Clash 订阅流量** | `clash-subscribe` | `traffic-report` | [`src/modules/clash/service/clashSubscribeService.js`](./src/modules/clash/service/clashSubscribeService.js#L138) | `{ action: 'traffic-report', source, upload, download, total, expire }` |
| **库洛游戏签到** | `kuro-game-sign` | `sign-report` | [`src/jobs/schedule/kuroSignSchedule.js`](./src/jobs/schedule/kuroSignSchedule.js#L16) | `{ action: 'sign-report', level, handleCount, errorCount, ...data }` |
| **系统配置与基建** | `system-config` | `reloaded` | [`src/core/context/k8sContext.js`](./src/core/context/k8sContext.js#L85) | `{ action: 'reloaded', component: 'k3s-watcher' }` |
| **MinIO 存储故障告警** | `media-minio` | `retry-exceeded` / `failed` | [`src/modules/media/service/minio/mediaMinioStateService.js`](./src/modules/media/service/minio/mediaMinioStateService.js#L225) | `{ action: 'retry-exceeded', minioId, attempt, maxAttempts, level: 'warn' }` |

---

## 🛠️ 二、待改造模块详细方案与代码对比

### 1. B 站主播开播/下播提醒 (`bilive-stream`)
- **文件**：[`src/modules/media/service/bilive/biliveStreamService.js:169`](./src/modules/media/service/bilive/biliveStreamService.js#L169)
- **改造前**：
  ```javascript
  f && pushNotification(`[Bilive Stream ${isStarted ? 'Started' : 'Ended'}] [${dateFormat(tryResolveTime(timestamp))}] ${hostName}: ${title}`);
  ```
- **改造后**：
  ```javascript
  f && pushNotification({
      event: 'bilive-stream',
      title: `${hostName} ${isStarted ? '开播啦 🔴' : '已下播 ⚪'}`,
      message: title,
      extra: {
          action: isStarted ? 'started' : 'ended',
          hostName,
          roomId,
          title,
          timestamp,
          isStarted
      }
  }, 'BiliveService');
  ```

---

### 2. 爬虫新视频采集归档 (`media-crawl`)
- **文件**：[`src/modules/media/service/crawl/hanime1/index.js:77`](./src/modules/media/service/crawl/hanime1/index.js#L77)
- **改造前**：
  ```javascript
  await pushNotification(JSON.stringify({ event: 'Crawl', data: created }));
  ```
- **改造后**：
  ```javascript
  await pushNotification({
      event: 'media-crawl',
      title: 'Hanime1 视频抓取入库',
      message: `成功抓取并入库 ${created.length} 部新视频`,
      extra: {
          source: 'hanime1',
          action: 'created',
          count: created.length,
          videos: created
      }
  }, 'CrawlService');
  ```

---

### 3. 番剧 RSS 下载任务流转 (`anime-rss-task`)
统一收敛下载任务添加、下载完成与异常流转，三态统一在一个组件内展示。
- **文件**：[`src/modules/anime/service/rss/rssTaskService.js`](./src/modules/anime/service/rss/rssTaskService.js)
- **改造点 A（任务添加 - 第 108 行）**：
  - *改造前*：`pushNotification(`[Task Added] ${rssResult?.title}`);`
  - *改造后*：
    ```javascript
    pushNotification({
        event: 'anime-rss-task',
        title: '番剧种子任务已添加',
        message: rssResult?.title || '',
        extra: {
            action: 'added',
            resultId,
            taskId,
            title: rssResult?.title
        }
    }, 'RssTaskService');
    ```
- **改造点 B（任务下载完成 - 第 408 行）**：
  - *改造前*：`pushNotification(`[Torrent Complete] ${rssResult?.title}`);`
  - *改造后*：
    ```javascript
    pushNotification({
        event: 'anime-rss-task',
        title: '番剧种子下载完成',
        message: rssResult?.title || '',
        extra: {
            action: 'completed',
            rssResultId,
            uuid,
            title: rssResult?.title
        }
    }, 'RssTaskService');
    ```
- **改造点 C（任务解析失败 - 第 133 行）**：
  - *改造前*：`pushNotification(`Resolve rss task error. Please handle it manually. Task UUID: ${uuid}`);`
  - *改造后*：
    ```javascript
    pushNotification({
        event: 'anime-rss-task',
        title: '番剧解析异常告警',
        message: '剧集解析失败，请手动介入处理',
        extra: {
            action: 'resolve-failed',
            level: 'error',
            uuid
        }
    }, 'RssTaskService');
    ```

---

### 4. 番剧 RSS 定时订阅更新检查 (`anime-rss-subscribe`)
- **文件**：[`src/modules/anime/service/rss/rssScheduleService.js:176-178`](./src/modules/anime/service/rss/rssScheduleService.js#L176-L178)
- **改造前**：
  ```javascript
  function pushToNotification(data) {
      pushNotification(JSON.stringify({ event: 'RSS Subscribe', ...data }), 'Server');
  }
  ```
- **改造后**：
  ```javascript
  function pushToNotification(data) {
      const { effectRows = 0, handledCount = 0 } = data;
      pushNotification({
          event: 'anime-rss-subscribe',
          title: '番剧 RSS 订阅更新',
          message: `检查完成：新增 ${effectRows} 集，处理 ${handledCount} 个订阅`,
          extra: {
              action: 'updated',
              ...data
          }
      }, 'RssScheduleService');
  }
  ```

---

### 5. Bangumi 番剧封面图同步 (`bangumi-image`)
- **文件**：[`src/modules/anime/service/bangumi/bangumiImagesService.js:120-125`](./src/modules/anime/service/bangumi/bangumiImagesService.js#L120-L125)
- **改造前**：
  ```javascript
  pushNotification(JSON.stringify({
      event: 'Bangumi Image Sync',
      complete: completeIds.size,
      failed: failedIds.size,
      total: rows
  }), 'Server');
  ```
- **改造后**：
  ```javascript
  pushNotification({
      event: 'bangumi-image',
      title: 'Bangumi 番剧封面同步完成',
      message: `同步完成：成功 ${completeIds.size} 张，失败 ${failedIds.size} 张，共计 ${rows} 张`,
      extra: {
          action: 'sync-complete',
          complete: completeIds.size,
          failed: failedIds.size,
          total: rows
      }
  }, 'BangumiImagesService');
  ```

---

### 6. Clash 订阅流量与到期报告 (`clash-subscribe`)
- **文件**：[`src/modules/clash/service/clashSubscribeService.js:130-139`](./src/modules/clash/service/clashSubscribeService.js#L130-L139)
- **改造前**：
  ```javascript
  let info = subInfo.split('; ');
  const message = { event: 'Clash Subscribe' };
  info.forEach(str => {
      const kv = str.split('=');
      if (kv.length === 2) message[kv[0]] = kv[1];
  });
  pushNotification(JSON.stringify(message), from);
  ```
- **改造后**：
  ```javascript
  let info = subInfo.split('; ');
  const trafficData = {};
  info.forEach(str => {
      const kv = str.split('=');
      if (kv.length === 2) trafficData[kv[0]] = kv[1];
  });
  pushNotification({
      event: 'clash-subscribe',
      title: `Clash 订阅流量提醒 [${from}]`,
      message: `已同步节点订阅状态`,
      extra: {
          action: 'traffic-report',
          source: from,
          ...trafficData
      }
  }, from);
  ```

---

### 7. K3s 系统配置变更监听 (`system-config`)
- **文件**：[`src/core/context/k8sContext.js:85`](./src/core/context/k8sContext.js#L85)
- **改造前**：
  ```javascript
  pushNotification(`[K3S Configuration Watcher] Configuration changed.`);
  ```
- **改造后**：
  ```javascript
  pushNotification({
      event: 'system-config',
      title: 'K3S 系统配置热更新',
      message: 'K3S ConfigMap 变更已生效并重新加载系统上下文',
      extra: {
          action: 'reloaded',
          component: 'k3s-watcher'
      }
  }, 'K3sWatcher');
  ```

---

### 8. MinIO 存储超限与故障状态 (`media-minio`)
- **文件**：[`src/modules/media/service/minio/mediaMinioStateService.js:223-235`](./src/modules/media/service/minio/mediaMinioStateService.js#L223-L235)
- **改造前**：
  ```javascript
  const message = `Minio[${minioId}] auto retry reached max attempts(${MINIO_RETRY_POLICY.maxAttempts}), please handle it manually.`;
  __log.warn(message);
  pushNotification(message);
  ```
- **改造后**：
  ```javascript
  const message = `Minio[${minioId}] 自动重试已达最大限制(${MINIO_RETRY_POLICY.maxAttempts})，请手动介入处理`;
  __log.warn(message);
  pushNotification({
      event: 'media-minio',
      title: 'MinIO 重试超限告警',
      message,
      extra: {
          action: 'retry-exceeded',
          level: 'warn',
          minioId,
          attempt: record.attempt,
          maxAttempts: MINIO_RETRY_POLICY.maxAttempts
      }
  }, 'MediaMinioService');
  ```

---

## 🚫 三、建议保持原样的日志类清单 (As-Is List)

以下位置属于**通用日志辅助函数或底层异常兜底**，本身只接收单一字符串消息，无需过度设计。已由 `pushNotification(string)` 原生兼容自动填充 `event: 'message'`：
1. [`rssEpisodeService.js#363`](./src/modules/anime/service/rss/rssEpisodeService.js#363) (`logAndPushNotification`)
2. [`rssSubtitleService.js#417`](./src/modules/anime/service/rss/rssSubtitleService.js#417) (`logAndPushNotification`)
3. [`mediaMinioIoService.js#144`](./src/modules/media/service/minio/mediaMinioIoService.js#144) (`logAndPushNotification`)
4. [`biliveFileService.js#266`](./src/modules/media/service/bilive/biliveFileService.js#266) (`printAndPushNotificationWarnMessage`)
5. [`biliveSessionService.js#85`](./src/modules/media/service/bilive/biliveSessionService.js#85) (`printAndPushNotificationWarnMessage`)
6. [`biliveStreamService.js#375`](./src/modules/media/service/bilive/biliveStreamService.js#375) (`printAndPushNotificationWarnMessage`)
7. [`mediaMinioService.js#205`](./src/modules/media/service/mediaMinioService.js#205) (`notifyUpdateMediaMinioStatusFailed`)
8. [`mediaTaskService.js#89`](./src/modules/media/service/mediaTaskService.js#89) (`notifyUpdateTaskStatusFailed`)

---

## 📋 四、待确认执行项

- [ ] 1. 确认 `bilive-stream` 统一事件及 `extra.action = 'started' | 'ended'` 设计
- [ ] 2. 确认 `media-crawl` 爬虫视频抓取事件结构
- [ ] 3. 确认 `anime-rss-task` 整合种子添加/解析失败/下载完成三态事件设计
- [ ] 4. 确认 `anime-rss-subscribe` 订阅更新事件结构
- [ ] 5. 确认 `bangumi-image` 封面同步事件结构
- [ ] 6. 确认 `clash-subscribe` 流量报告事件结构
- [ ] 7. 确认 `system-config` 与 `media-minio` 运维告警事件结构
