# 知识库 2.0 身份版候选

插件 ID `opcb.knowledge`，原生 API v1。当前为待实机验收的 2.0 候选，未宣称三台设备完成更新。

个人只需在本机首次绑定 Buzz 身份，之后自动验签，不用知识库密码，没有12小时重新登录。Agent 保留独立身份并继承所属人的只读授权，新增 Agent 不需要管理员再登记。管理权限由独立的知识库管理插件和服务器管理员名单控制。

首次连接会在你选择的可写私人对话保存一条原生身份绑定记录，仅含设备公钥、随机挑战、用途和受众；不包含私钥、知识正文或账号凭据。Agent 首次连接工具会发布同类原生笔记。设备私钥不可导出且保存在本机 IndexedDB；换设备需要一次绑定，管理员不用重配个人ACL。

页面提供知识库目录、文档列表、正文阅读、标题目录、清单、代码与表格；可按页缓存正文。缓存本机AES-GCM加密，8MiB/100项/30天限制。读取缓存先在线核权限，撤权后拒绝后续访问；离线不绕过鉴权，已展示或复制的资料无法追回。清除正文缓存可保留绑定；移除本机绑定需重新连接。

Agent 工具：`opcb_knowledge_connect`、`opcb_knowledge_sources`、`opcb_knowledge_search`、`opcb_knowledge_read`。关闭阅读页面不影响工具。搜索为字面关键词检索，资料正文是不可信参考数据，回答保留原始引用。

依赖中心 `services/knowledge` 身份网关及原只读索引；仅声明现有知识域名的网络权限，无进程命令权限。构建源 `src/knowledge/reader.mjs` 与 `identity-client.mjs`，`npm run build:knowledge` 生成自包含入口。历史密码包保留供迁移，不是新登录路径。

兼容参考：官方 block/buzz-app v1.0.1，Studio macOS ARM64 实际1.0.1/1.0.1。使用React/pages/relay/host/agents公开能力，原生 outbox45010 与 Agent publish30023。当前本地签名/HTTP/策略/缓存测试不代表原生签名记录已在真实社区接受；安装后须核对绑定、工具、撤权、重启保留、窄屏和深浅主题。Android/iOS未验收，不升级或重建宿主。

通过中心固定分发分支+完整commit的原生审核卡交付，由用户最终确认；同ID来源迁移按 SOURCE_MIGRATION.md，不修改注册表。
