# 模版工厂试点同步

服务读取模版工厂频道的单件交付和同版验收。原始消息及附件保存在 Buzz。服务器用交付事件 ID 标识版本，用独立的 SQLite 文件持久化设备证明和快照。每轮同步结束后等 15 秒再检查来源，重复读取同一结果时保留同一个 revision。

指定验收人可在该版交付下点原生 👍。服务端核对频道角色、有效反应列表和指向同一交付的签名事件。撤下当前点赞后，快照重新按仍有效的验收回复判定。点赞记录的 `review.messageUrl` 指向带反应的单件交付。

提交人是指定的 Buzz 本人。如果由 Agent 代交，启动时须同时指定转发 Agent、本人签名的授权消息以及单件交付消息。验收人用指定的 Buzz 本人身份直接回复该条交付。“通过”“通过这一版”或“验收通过”登记通过，“退回：原因”或“需修改：原因”登记退回。若客户端将回复发到总线程，请在验收命令后以空格附上单件交付的 `buzz://message?channel=…&id=…` 链接。服务端核对频道角色、消息签名和具体交付版本。

## 测试服务

依赖 Python 3.11、Node 20 以上和当前官方 `buzz` CLI。运行 `npm ci` 安装签名验证依赖。将服务运行在单独的环境，使用对模版工厂频道已有读取权限的 Buzz CLI 配置。状态目录须由运行用户持有，权限为 `0700`。工作台对接使用独立的同源 HTTPS 测试入口，指向此服务的 loopback 端口。

```sh
python3 services/work_sync/server.py \
  --state "$WORK_SYNC_STATE" --relay "$WORK_SYNC_RELAY" \
  --community "$WORK_SYNC_COMMUNITY" --audience "$WORK_SYNC_AUDIENCE" \
  --owner "$WORK_SYNC_OWNER" --reviewer "$WORK_SYNC_REVIEWER" \
  --task-id "$WORK_SYNC_TASK_ID" --title "$WORK_SYNC_TITLE" \
  --submission-id "$WORK_SYNC_SUBMISSION" \
  --forwarding-agent "$WORK_SYNC_AGENT" --forwarding-request "$WORK_SYNC_REQUEST"
```

本人直接上传时，省略两个 `--forwarding-*` 参数。试点启动前可省略 `--submission-id`，此时返回空快照。私有状态目录应位于仓库之外。

### 自动读取后续交付

保留首版的全部启动参数，追加 `--discover-since <起始 Unix 秒>`。频道内的新交付须包含一个 Buzz 原生附件，并在正文各写一行。

```text
work-sync-task: template-wipe-zoom
work-sync-title: 擦拭与文字放大 V10
```

配置的提交人可本人发送。配置的转发 Agent 可根据原获准指令回传，后续也可回复提交人本人发在频道内、带相同 `work-sync-task` 的签名指令。服务校验作者、频道角色、原授权消息和附件哈希。每个任务同一附件哈希只保留首条有效交付，另一个哈希是独立版本，验收须点在对应版本的单件回执上。工作台快照保留首件及最近的有效交付，总量最多 100 条。完整历史留在 Buzz。

### 常驻服务器切换

1. 使用目标主机获准的独立 Buzz 身份和官方 CLI。先以该服务用户验证能读取模版工厂成员、两条交付及其反应。CLI 身份由目标环境提供，只在服务用户的权限范围内使用。原设备的 Buzz 登录、配对、密钥和插件本地存储留在设备上。
2. 用 SQLite 原生备份把现有 `work-sync.sqlite3` 复制到候选私有目录。目录为 `0700`，数据库为 `0600`。使用受控主机间传输。候选服务用独立回环端口、相同 HTTPS audience 和该备份并行同步。检查完整性、设备授权数量、快照版本和两份交付。现有 HTTPS 路径在检查通过前继续指向旧服务。
3. 切换时短暂停接受旧服务的绑定和读取并排空在途请求，再做最终一致性备份，保留设备表和已使用的请求 nonce。用最终备份启动新服务，启用原 HTTPS 路径，确认匿名读返回 401，两台工作台用原绑定刷新出同一版本。关闭试点上游后再验证一次。回退时保持单一上游，并恢复或迁回当时最新的 SQLite 状态。

## 插件接口

基址为 `https://<测试域名>/opcb-plugins/work-sync/api/v1`。`GET /health` 返回服务能否生成快照。

1. `POST /challenge` 接收 `{fingerprint}`，返回 `{nonce,community}`。
2. `POST /bind` 接收 `{event}`。客户端在当前本人可写的私人 Solo 通过原生 outbox 签发 kind `45010`，内容包含 `version:1`、`purpose:"opcb.work-sync.device-binding"`、基址 `audience`、`community`、`deviceKey`、`nonce`、`role:"read"`，服务端返回 `{device,owner,delegated:false}`。
3. `POST /snapshot` 接收 `{body,proof}`。`body` 是包含 `channelId` 的 JSON 字符串，`proof` 包含 `device`、一次性 `nonce`、Unix 秒 `timestamp` 和 `signature`。签名原文为 JSON 数组 `['opcb.work-sync.request.v1', 完整快照URL, body, nonce, timestamp]`，采用 P-256 / SHA-256，签名编码为 base64url。

快照返回 `schema`、`channelId`、`revision`、`updatedAt` 和 `items`。每项包含 `taskId`、`version`、`status`、`title`、`submissionUrl`、`attachmentUrls` 和 `review`。`review` 是 `null` 或包含 `reviewerId`、`reviewedAt`、`reason`、`messageUrl` 的记录。状态为 `pending_review`、`accepted` 或 `changes_requested`。时间使用 ISO 8601。

错误响应为 `{error:{code,message}}`。400 是 `invalid_request`，401 是 `invalid_proof`，403 是 `forbidden`，503 是 `source_unavailable`。两台设备以同一频道身份读取时应获得相同的快照版本。`npm run ci` 包含签名、成员撤权、同版验收和快照一致性的本机回归测试。
