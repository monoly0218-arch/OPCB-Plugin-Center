# OPCB 插件中心

集中保存 Buzz 插件代码、下载包与安装说明。当前包含 **13 类业务插件、15 份版本包**：Moo 已上传的号池 1.4，加上 Studio 本机 13 项外部插件快照。号池 1.3 与 1.4 使用相同插件 ID，属于不同版本。

## 插件中心入口

已实现原生 **OPCB 插件中心 0.1.0**：[说明](plugins/opcb.plugin-center/0.1.0/README.md) · [下载](releases/OPCB_PLUGIN_CENTER_0_1_0.zip)。支持搜索、分类、依赖说明、本机安装状态，以及点击进入宿主安装审核。插件中心本身通过安装审核卡交付，不会自动安装。

本次 0.1 交付按潘涛 2026-11-13 确认的本机方式验证和打包，完整检查为 `npm run ci`，打包为 `python3 scripts/package_release.py`。GitHub Actions 仅保留手动入口，本次不等待 Mac Runner；本机验证与远端 CI 状态分别记录。

业务目录为 [REGISTRY.json](REGISTRY.json)，含 13 类业务插件、15 个版本，历史号池 1.3 和旧邀请码知识库默认收起。每个安装目标都有独立分发分支和精确提交，避免主目录发现不完整；插件中心之外的业务授权仍由对应服务管理。

[下载 Studio 全部 13 项插件](releases/OPCB_STUDIO_PLUGINS_20261113.zip) · [分发目录与版本](CATALOG.json) · [文件校验](SHA256SUMS.txt)

## 统一来源迁移

Studio 与 MacBook 的后续插件源码、下载和审核安装统一来自本仓库。保留旧工作树与未推提交；本地配置、账号、登录态和配对不上传。具体版本、差异与宿主换源限制见 [来源迁移说明](SOURCE_MIGRATION.md)。已安装同 ID 不代表已换源，必须回读原生安装来源。

## 2.0 执行计划

由潘涛 Studio 统一推进各插件的公开可用版本，优先完成知识库与插件中心，再推进日常任务和内容业务。完整排序、依赖、每项完成条件及当前未验收边界见 [2.0 执行计划](ROADMAP_2_0.md)；逐项验收后发布正式 2.0，不把已有快照批量改号当作升级完成。

知识库阅读版 rc.4（已确认 v3 设计）与管理版 rc.3 正在候选验证：[阅读插件](plugins/opcb.knowledge/2.0.0/README.md) · [管理插件](plugins/opcb.knowledge-admin/2.0.0/README.md) · [服务与权限](services/knowledge/README.md)。按个人授权，Agent 继承只读，不使用共享密码或12小时登录；候选见 [CANDIDATES.json](CANDIDATES.json)，尚不替代当前 REGISTRY 默认版本，实际部署/安装/业务验收以交付回执为准。

## 安装

在 Buzz 对话里指定下表插件，让 Agent 从本仓库对应路径发起**安装审核卡**，固定提交；本人审阅后确认安装。上传、下载和安装是不同步骤，插件不会随本次上传自动安装。

同 ID 的 1.3 / 1.4 不可并行安装，号池升级前先核对本机分配器依赖。业务系统、知识源、号池与连接器仍需本人登录、授权或配对。

## 下载目录

| 插件 | 版本 | 下载 | 依赖与边界 |
| --- | --- | --- | --- |
| [higgsfiled号池1.4](plugins/higgsfield-pool/1.4/README.md) | 原有 1.4 | [ZIP](releases/HIGGSFIELD_POOL_1_4.zip) | 依赖 Moo 本机分配器和路径；其他设备需要配置后端。 |
| [聊天产物](plugins/opcb.chat-artifacts/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.chat-artifacts_20261113.zip) | 读取当前聊天已有文件和链接，访问范围由宿主和聊天权限决定。 |
| [公司看板](plugins/opcb.company-board/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.company-board_20261113.zip) | 读取原工作进度频道 Canvas，需当前社区成员权限；不自动同步任务执行进度。 |
| [内容工厂](plugins/opcb.content-factory/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.content-factory_20261113.zip) | 需要本人访问 staging.paolab.cn 原内容服务；原生登录和原站会话分别管理。 |
| [Grok Bot 连接器](plugins/opcb.grokbot-bridge/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.grokbot-bridge_20261113.zip) | 桌面端需要 python3、已有 Grok Bot Webhook 和本人配置的密钥；回传需单独配置 HTTPS 接收服务。 |
| [higgsfiled号池1.3](plugins/opcb.higgsfield-mailbox/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.higgsfield-mailbox_20261113.zip) | 这是 Studio 当前使用的 1.3 存档，读取授权号池并收码；未接入 Moo 的统一领取服务。与仓库已有 1.4 使用相同插件 ID，安装时二选一，不自动降级。 |
| [热点工厂](plugins/opcb.hot-workflow/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.hot-workflow_20261113.zip) | 热点筛选、复刻、BD 和分发流程界面。保留代码内公开参考种子；自动采集、平台统计与制作接口未接通，协作数据需原频道权限。 |
| [知识库](plugins/opcb.knowledge/2026-11-13-password/README.md) | 共享密码版 | [ZIP](releases/opcb.knowledge_20261113_password.zip) | 服务端已启用共享密码；人和 Agent 只读访问。密码由管理员提供，不随包分发。旧邀请码目录保留历史。 |
| [Muse 连接器](plugins/opcb.muse-link/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.muse-link_20261113.zip) | 仅适用于支持宿主进程能力的桌面端；需要 python3、电脑既有 Muse Link 依赖及独立配对，包内不含配对信息。 |
| [15号成果报告](plugins/opcb.results-report/2026-11-13/README.md) | 已安装快照，空白分发版 | [ZIP](releases/opcb.results-report_20261113.zip) | 空白分发模板：团队样片、页面截图和私人笔记链接已移除；真实数据留空，模拟数据须主动切换查看。 |
| [上粮山资产库](plugins/opcb.shangliangshan-assets/2026-11-13/README.md) | 已安装快照，空白分发版 | [ZIP](releases/opcb.shangliangshan-assets_20261113.zip) | 空白分发版：已移除本机素材快照和缩略图；原生实时数据接入未完成，原站操作需本人登录 staging.paolab.cn。 |
| [上粮山电商看板](plugins/opcb.shangliangshan-ecommerce/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.shangliangshan-ecommerce_20261113.zip) | 沿用 paolab.cn/shangliangshan/ 原地址，网站负责登录与权限；路由及业务能力需本人实际验收。 |
| [任务中心](plugins/opcb.task-center/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.task-center_20261113.zip) | 与公司看板读取相同工作进度频道 Canvas；私人 Solo、成员身份和工具范围由宿主校验。 |
| [选题灵感](plugins/opcb.xhs-topic-burst/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.xhs-topic-burst_20261113.zip) | 沿用 Steven 的已安装版本，读取原社区共享内容；没有同步其他成员设备上的未交付版本。 |

## 安装目录发现的兼容入口

当前宿主从大型仓库发现安装目录时可能漏列部分插件。插件中心使用 [REGISTRY.json](REGISTRY.json) 中每项的 `reviewSource`：独立分发分支、路径 `.` 和精确提交，避免依赖主分支的目录发现结果。

Agent 通过工具发起审核卡时同样使用 `reviewSource.reference`、`reviewSource.commit` 与路径 `.`。`plugin_discover` 当前不接受将提交 SHA 当作分支使用，分支和提交应分别传入。

## 分发范围与验证

本次归集的是 Studio 设备上全部 13 项外部插件；其他成员设备上的独有版本须由其交付后补充。宿主自带插件不重复打包，列表见 [BUNDLED_PLUGINS.json](BUNDLED_PLUGINS.json)。本仓库不是全员设备完成安装或业务验收的证明。

不导出注册表、运行配置、账号凭据、登录态、配对文件或聊天数据库。资产库与成果报告移除了内嵌本机素材、团队样片/截图及私人笔记链接，作为空白版本分发；UI 设计资源和公开参考种子仍随代码保留。

全部分发目录通过 manifest/入口检查、JavaScript 语法检查及 ZIP/文件 SHA256 校验；两项空白分发包另检查空状态渲染。没有在本次重新执行业务系统集成验收，也未重新构建宿主。验证命令：`python3 scripts/validate_packages.py`。

## 继续提交插件

开发与交付规范见 [AGENTS.md](https://github.com/monoly0218-arch/OPCB-Plugin-Center/blob/main/AGENTS.md)。宿主使用 [Buzz 官方原生发布版](https://github.com/block/buzz-app/releases)，OPCB 功能通过原生插件扩展；旧 `miaopantao/opcb-buzz` 定制客户端路线退出日常开发，历史代码与未交付事项保留迁移依据。

每个版本提交 `plugins/<插件ID>/<版本>/manifest.json`、`plugin.js` 和 `README.md`，必要时附图标及桥接源码；安装包放在 `releases/`。注明依赖和验证范围，更新目录与校验值。不要上传真实账号、密钥、业务数据库或个人素材。不要覆盖同事已有版本。
