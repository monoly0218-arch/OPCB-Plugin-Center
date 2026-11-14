# OPCB 插件中心

集中保存 Buzz 插件代码、下载包与安装说明。当前包含 **15 类业务插件**：Moo 已上传的号池 1.4，加上 Studio 本机 13 项外部插件快照，以及新增 HTML 阅读器候选。号池 1.3 与 1.4 使用相同插件 ID，属于不同版本。

## 插件中心入口

已实现原生 **OPCB 插件中心 0.1.0**：[说明](plugins/opcb.plugin-center/0.1.0/README.md) · [下载](releases/OPCB_PLUGIN_CENTER_0_1_0.zip)。支持搜索、分类、依赖说明、本机安装状态，以及点击进入宿主安装审核。插件中心本身通过安装审核卡交付，不会自动安装。

本次 0.1 交付按潘涛 2026-11-13 确认的本机方式验证和打包，完整检查为 `npm run ci`，打包为 `python3 scripts/package_release.py`。GitHub Actions 仅保留手动入口，本次不等待 Mac Runner；本机验证与远端 CI 状态分别记录。

业务目录为 [REGISTRY.json](REGISTRY.json)，含 15 类业务插件及保留版本，历史号池 1.3 和旧邀请码知识库默认收起。每个安装目标都有独立分发分支和精确提交，避免主目录发现不完整；插件中心之外的业务授权仍由对应服务管理。

[下载本候选目录全部 15 项插件](releases/OPCB_STUDIO_PLUGINS_20261113.zip) · [分发目录与版本](CATALOG.json) · [文件校验](SHA256SUMS.txt)

## 统一来源迁移

Studio 与 MacBook 的后续插件源码、下载和审核安装统一来自本仓库。保留旧工作树与未推提交；本地配置、账号、登录态和配对不上传。具体版本、差异与宿主换源限制见 [来源迁移说明](SOURCE_MIGRATION.md)。已安装同 ID 不代表已换源，必须回读原生安装来源。

## 2.0 执行计划

由潘涛 Studio 统一推进各插件的公开可用版本，优先完成知识库与插件中心，再推进日常任务和内容业务。完整排序、依赖、每项完成条件及当前未验收边界见 [2.0 执行计划](ROADMAP_2_0.md)；逐项验收后发布正式 2.0，不把已有快照批量改号当作升级完成。

本轮推荐修复候选：知识库阅读/管理rc.6、任务中心/公司看板rc.7、HTML阅读器rc.2，固定来源见REGISTRY。新候选已发布不等于设备已更新。任务本人核对后通过原生Canvas版本检查保存执行记录；归属、媒体及审计服务部署边界见集中修复清单。

## 2026-11-14 集中修复候选

五项新候选：知识库阅读/管理rc.6、任务中心/公司看板rc.7、HTML阅读器rc.2。完整问题与状态见[集中修复清单](FIXES_20261114.md)。推荐入口及固定来源以REGISTRY为准；旧版目录和包保留。新版本经原生更新审核卡、本人确认后安装，不把发布视为已安装。

任务已接官方Canvas版本检查保存，只有本人核对提交才写执行记录；Agent工具仍只读。HTML改为同窗口铺满，系统全屏用Buzz窗口绿色按钮。审计服务差异表尚待登录部署；媒体原件和资料团队归属仍需正式来源依据。

## 安装

在 Buzz 对话里指定下表插件，让 Agent 从本仓库对应路径发起**安装审核卡**，固定提交；本人审阅后确认安装。上传、下载和安装是不同步骤，插件不会随本次上传自动安装。

同 ID 的 1.3 / 1.4 不可并行安装，号池升级前先核对本机分配器依赖。业务系统、知识源、号池与连接器仍需本人登录、授权或配对。

## 下载目录

新增候选：[HTML 阅读器 0.1.0-rc.2](plugins/opcb.html-reader/0.1.0-rc.2/README.md) · [ZIP](releases/OPCB_HTML_READER_0_1_0_RC2.zip)。侧栏打开 HTML 附件或本地文件、铺满窗口阅读；先支持 Mac Buzz＋Python 3，原生铺满与关闭清理待更新后验收。固定来源已登记到 REGISTRY；Mac原生安装状态以实际回读为准。

| 插件 | 版本 | 下载 | 依赖与边界 |
| --- | --- | --- | --- |
| [知识库管理](plugins/opcb.knowledge-admin/2.0.0-rc.6/README.md) | 2.0.0-rc.6 | [ZIP](releases/opcb.knowledge-admin_2_0_0_rc6.zip) | 管理员个人签名、人员权限与审计，安装不授予管理员资格。 |
| [higgsfiled号池1.4](plugins/higgsfield-pool/1.4/README.md) | 原有 1.4 | [ZIP](releases/HIGGSFIELD_POOL_1_4.zip) | 依赖 Moo 本机分配器和路径；其他设备需要配置后端。 |
| [聊天产物](plugins/opcb.chat-artifacts/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.chat-artifacts_20261113.zip) | 读取当前聊天已有文件和链接，访问范围由宿主和聊天权限决定。 |
| [公司看板](plugins/opcb.company-board/2.0.0-rc.7/README.md) | 2.0.0-rc.7 | [ZIP](releases/opcb.company-board_2_0_0_rc7.zip) | 统一导航、项目与任务；本人核对后保存原Canvas执行记录。 |
| [内容工厂](plugins/opcb.content-factory/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.content-factory_20261113.zip) | 需要本人访问 staging.paolab.cn 原内容服务；原生登录和原站会话分别管理。 |
| [Grok Bot 连接器](plugins/opcb.grokbot-bridge/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.grokbot-bridge_20261113.zip) | 桌面端需要 python3、已有 Grok Bot Webhook 和本人配置的密钥；回传需单独配置 HTTPS 接收服务。 |
| [higgsfiled号池1.3](plugins/opcb.higgsfield-mailbox/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.higgsfield-mailbox_20261113.zip) | 这是 Studio 当前使用的 1.3 存档，读取授权号池并收码；未接入 Moo 的统一领取服务。与仓库已有 1.4 使用相同插件 ID，安装时二选一，不自动降级。 |
| [热点工厂](plugins/opcb.hot-workflow/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.hot-workflow_20261113.zip) | 热点筛选、复刻、BD 和分发流程界面。保留代码内公开参考种子；自动采集、平台统计与制作接口未接通，协作数据需原频道权限。 |
| [跑圈集团知识库](plugins/opcb.knowledge/2.0.0-rc.6/README.md) | 2.0.0-rc.6 | [ZIP](releases/opcb.knowledge_2_0_0_rc6.zip) | 七团队与专题、个人身份权限、Agent继承读取；原件媒体待接入。 |
| [Muse 连接器](plugins/opcb.muse-link/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.muse-link_20261113.zip) | 仅适用于支持宿主进程能力的桌面端；需要 python3、电脑既有 Muse Link 依赖及独立配对，包内不含配对信息。 |
| [15号成果报告](plugins/opcb.results-report/2026-11-13/README.md) | 已安装快照，空白分发版 | [ZIP](releases/opcb.results-report_20261113.zip) | 空白分发模板：团队样片、页面截图和私人笔记链接已移除；真实数据留空，模拟数据须主动切换查看。 |
| [上粮山资产库](plugins/opcb.shangliangshan-assets/2026-11-13/README.md) | 已安装快照，空白分发版 | [ZIP](releases/opcb.shangliangshan-assets_20261113.zip) | 空白分发版：已移除本机素材快照和缩略图；原生实时数据接入未完成，原站操作需本人登录 staging.paolab.cn。 |
| [上粮山电商看板](plugins/opcb.shangliangshan-ecommerce/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.shangliangshan-ecommerce_20261113.zip) | 沿用 paolab.cn/shangliangshan/ 原地址，网站负责登录与权限；路由及业务能力需本人实际验收。 |
| [任务中心](plugins/opcb.task-center/2.0.0-rc.7/README.md) | 2.0.0-rc.7 | [ZIP](releases/opcb.task-center_2_0_0_rc7.zip) | 当前计划、月历、看板与本人执行登记；Agent工具仍只读。 |
| [选题灵感](plugins/opcb.xhs-topic-burst/2026-11-13/README.md) | 已安装快照 | [ZIP](releases/opcb.xhs-topic-burst_20261113.zip) | 沿用 Steven 的已安装版本，读取原社区共享内容；没有同步其他成员设备上的未交付版本。 |

## 安装目录发现的兼容入口

当前宿主从大型仓库发现安装目录时可能漏列部分插件。插件中心使用 [REGISTRY.json](REGISTRY.json) 中每项的 `reviewSource`：独立分发分支、路径 `.` 和精确提交，避免依赖主分支的目录发现结果。

Agent 通过工具发起审核卡时同样使用 `reviewSource.reference`、`reviewSource.commit` 与路径 `.`。`plugin_discover` 当前不接受将提交 SHA 当作分支使用，分支和提交应分别传入。

## 分发范围与验证

本目录保留 Studio 设备 13 项外部插件快照，并加入 HTML 阅读器候选；其他成员设备上的独有版本须由其交付后补充。宿主自带插件不重复打包，列表见 [BUNDLED_PLUGINS.json](BUNDLED_PLUGINS.json)。本仓库不是全员设备完成安装或业务验收的证明。

不导出注册表、运行配置、账号凭据、登录态、配对文件或聊天数据库。资产库与成果报告移除了内嵌本机素材、团队样片/截图及私人笔记链接，作为空白版本分发；UI 设计资源和公开参考种子仍随代码保留。

全部分发目录通过 manifest/入口检查、JavaScript 语法检查及 ZIP/文件 SHA256 校验；两项空白分发包另检查空状态渲染。没有在本次重新执行业务系统集成验收，也未重新构建宿主。验证命令：`python3 scripts/validate_packages.py`。

## 继续提交插件

开发与交付规范见 [AGENTS.md](https://github.com/monoly0218-arch/OPCB-Plugin-Center/blob/main/AGENTS.md)。宿主使用 [Buzz 官方原生发布版](https://github.com/block/buzz-app/releases)，OPCB 功能通过原生插件扩展；旧 `miaopantao/opcb-buzz` 定制客户端路线退出日常开发，历史代码与未交付事项保留迁移依据。

每个版本提交 `plugins/<插件ID>/<版本>/manifest.json`、`plugin.js` 和 `README.md`，必要时附图标及桥接源码；安装包放在 `releases/`。注明依赖和验证范围，更新目录与校验值。不要上传真实账号、密钥、业务数据库或个人素材。不要覆盖同事已有版本。

集团结构与实现边界见 [跑圈集团知识库](PAO_GROUP_KNOWLEDGE.md)。

任务改版已形成[基于19页参考的功能映射与可操作样板](TASK_WORKBENCH_V3.md)；当前任务实现与候选验收状态见集中修复清单；设计样板不代表真实执行数据。


聊天产物与现有集团知识库入库扩展rc.7为独立候选，保留最新主题和审计修复。见[接入说明](CHAT_ARTIFACTS_INTEGRATION.md)。生产和原生安装以验收回执为准。
