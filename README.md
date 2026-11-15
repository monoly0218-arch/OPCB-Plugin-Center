# OPCB 平台商业化计划与报告 · V3

版本2.0.0-rc.1，沿用ID `opcb.results-report` 与页面ID `report`。将本人确认的V3视觉落为原生插件：顶部Goals / Timeline / Progress，正文左右等宽，六张独立双屏页（目标、任务、内容、报告、视频、手机）。视频点击预览并在关闭时清理；不增加解释性小字。

## 共享来源与自动更新

- 与任务中心使用同一工作进度群Canvas：`buzz://channel/7dc199bc-755b-47bb-8f71-fe311b1f1ab1`。沿用任务ID、`opcb-task-execution-v1` 执行区、`opcb-task-checks-v1` 勾选区和明确的日期/时间表。勾选完工和已验收分列，不按日期或聊天推断完成。
- 当前页面可见时每30秒强读取；原生live事件、频道权限变化、回到前台和“手动更新”走同一串行读取入口。来源被撤权、账号/社区变化或读取失败时停止展示旧数据。关闭页面清理所有订阅、定时器和预览资源。不是后台Agent任务调度器，不自动代执行。
- 真实用户、付费、收入和账单没有新增平台采集API。未登记值显示“—”，不拿任务数或样片数推算经营实绩。
- “资料”内可填写真实累计实绩、统计日期与证据，保存到原Canvas独立 `opcb-commercial-report-v1` JSON区，包含 `schema:1, metrics, asOf, evidence, plan`。所有已登记实绩需要统计日期及HTTPS/Buzz证据链接。先读当前版本，冲突保留表单，不覆盖；保存后再次读回确认。页面保存是本人主动操作，Agent未新增写工具。该区不修改原任务、执行区、勾选区、预算批准或上线批准。
- 报告共享区存在时优先读取；否则保留已有本机计划/真实数据并标明“本机记录”。若需共享本机计划，在“资料”核对后保存到共享来源。导入计划仍进入原本机键，不会自动覆盖共享记录。

## 旧数据与边界

保留原 `brand-library` / `opcb.results-report.library` / version 1，继续读取 `library` 与 `commercial-plan`，不改命名、不自动迁移、不清空。模板JSON导入合并未有编号，不覆盖旧素材；导出可备份原媒体。原26屏通过分页保留，V6与历史页面按已有标签区分；没有当前网站截图时显示空状态。公共包无团队视频、截图、私人笔记或凭据。

模板、视频、手机图目前仍为本人本机资料；跨设备媒体同步没有因此接通。Android/iOS是否能加载此API v1插件以对应宿主能力及实机回读为准，桌面通过不代表移动宿主通过。

## 兼容与验证

2026-11-15实施核对：官方稳定v1.0.2，最新预发布v1.0.3-preview.2；Studio实际1.0.2。使用react / pages / relay / artifactStorage、session.canvas.read/save、channels及可选subscribeLive；无新增manifest.host权限，无宿主构建或升级。原生安装通过固定Git提交的审核卡，由本人最终确认。

完整检查 `npm run ci`；打包 `python3 scripts/package_release.py`。隔离宿主回归包含真实来源格式、旧媒体兼容、主题/尺寸、手动刷新、live刷新、撤权、冲突和读回；实际安装、原生存储与移动业务验收需在审核后另核。

设计方法参考 Damir Sokolovsky / [Unslop](https://github.com/heydamir/unslop)，CC BY 4.0；V3设计与实现：潘涛 Studio。Nunito / Resource Han Rounded字体许可随包提供；插件图标沿用原固定来源，许可见随包文件。
