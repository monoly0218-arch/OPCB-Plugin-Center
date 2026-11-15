# OPCB 插件中心

统一维护、分发和下载入口：<https://github.com/monoly0218-arch/OPCB-Plugin-Center>。宿主使用官方 Buzz 原生发布版。

## 全面更新到潘涛当前整套

对自己的 Buzz Agent 说：

> 帮我全面更新插件中心上的所有插件到我的本机。

Agent 按 [整套同步流程](PLUGIN_SYNC.md) 读取 **BASELINE.json**，比对本机后逐项发起原生安装/更新审核；本人确认后回读验证。已经一致的跳过，中断后可继续。

当前整套 **studio-2026-11-15-r1 / 17 项 OPCB 插件**，对应潘涛 Studio 实际安装的精确来源、revision 和启用状态。包含插件中心 0.3.3、HTML 阅读器 rc.4、Mobile Design rc.9、任务中心 rc.17、公司看板 rc.14及当前其余插件。号池选择 Studio 当前使用的 **1.3**；可选 1.4 与 1.3 使用同一 ID，不能一起安装。

当前正式发布目录是本仓库的 [`distribution/3dicons-catalog-20261115`](https://github.com/monoly0218-arch/OPCB-Plugin-Center/tree/distribution/3dicons-catalog-20261115)；首次读取先固定该分支的完整提交，再读取其 BASELINE、REGISTRY 和同步工具。已安装插件中心 0.3.3 也读取此目录。主分支的历史文件不能替代这个运行中的发布来源。

- [当前整套基线](BASELINE.json)：每 ID 一个精确版本，全面更新以它为准。
- [同步执行与恢复](PLUGIN_SYNC.md)：Agent 的触发语、比对、原生审核和完成判据。
- [下载本套 17 项](releases/OPCB_STUDIO_BASELINE_20261115_R1.zip)：固定代码与同步工具；下载不代表安装。
- [插件目录与独立来源](REGISTRY.json)：包含当前项、可选线路和历史版本，不应全部循环安装。
- [文件校验](SHA256SUMS.txt)：下载包与仓库文件的 SHA256。

初次使用的 Agent 尚不知道“插件中心”所指时，在请求后附本仓库地址即可。已知道后只需上面的触发语。无需新建全员安装账号，也无需将私人数据同步到公开仓库。

## 范围与审核

整套基线覆盖插件代码、固定来源、revision 和启用状态；不同来源需独立核对换源，保留本机配置。插件之外的账号、登录、配对、收藏、聊天和业务数据由每个人自己的权限管理。其他插件保留；Buzz 自带插件随官方客户端提供。

当前整套验证平台为 macOS / Buzz 1.0.2 / API 1。依赖 Python、原站登录或外部服务的插件仍需各人按说明配置。版本对齐、插件 active、业务验收分别记录；桌面通过不代表 Android/iOS 通过。不静默安装，不自动升级宿主，不通过手工文件夹或注册表绕过原生审核。

## 维护与历史

[AGENTS.md](AGENTS.md) 是协作入口；[图标维护](docs/IDENTITY_ICONS.md) 约束每次插件更新使用共享 3dicons V1 身份图；[来源迁移](SOURCE_MIGRATION.md) 说明跨源更新边界。常规验证为 `npm run ci`，确定性打包为 `python3 scripts/package_release.py`。

`CATALOG.json` 与旧日期合集保留兼容性/历史目录及单项候选，不作为当前整套对齐的依据。[2.0 计划](ROADMAP_2_0.md)、[知识库](PAO_GROUP_KNOWLEDGE.md)、[任务工作台](TASK_WORKBENCH_V3.md) 保留其各自的验收边界。旧版说明可从 Git 历史回查。

## 独立候选与业务说明

[任务中心 rc.18](docs/TASK_INTERACTIONS_RC18.md)、[HTML 附件颜色修订](docs/HTML_ATTACHMENT_COLOR_20261115.md)、[工厂与资产库本人角色](docs/FACTORY_ASSETS_ROLE_BINDING.md) 的发布与验收说明继续保留。REGISTRY 可包含比本机基线更新的候选；整套同步只按 BASELINE 选择，未安装的新候选不混入。
