# Studio 本机全部插件发布 · 2026-11-16

本次按 Studio 原生 plugin_list 固定 19 项外部插件；Buzz 自带插件继续随官方客户端提供。官方最新与本机均为 Buzz 1.0.2，原生插件 API 1，验证平台为 macOS；未升级或重启宿主，未更改本机安装及私人数据。

## 当前发布

1. `BASELINE.json` / `studio-2026-11-16-r1`：17 项 OPCB 插件的实际已安装精确版本、revision、启用及固定来源，包含插件中心 0.3.3 自身；补齐公司看板 RC17、商业化报告 RC6、任务中心 RC18。保留任务中心 RC19 候选和其他历史版本。旧基线保存在 `baselines/`，旧合集继续保留。
2. `STUDIO_INSTALLED.json` / `studio-all-2026-11-16-r1`：本机全部 19 项的公开代码分发清单、来源与哈希。17 项使用原固定分发提交；Claude 和团队日历另行收录，不混进原 17 项自动对齐契约。
3. `REGISTRY.json` 是当前运行的插件中心目录；已安装的插件中心 0.3.3 从 `distribution/3dicons-catalog-20261115` 读取。刷新目录可见全部新条目，不需要为目录更新替换插件中心本机代码。
4. `releases/OPCB_STUDIO_ALL_PLUGINS_20261116_R1.zip` 包含全部 19 项的代码、日历服务、说明及基线；`releases/OPCB_STUDIO_BASELINE_20261116_R1.zip` 保持原 17 项精确对齐流程。`CATALOG.json` 及 20261113 合集保留历史兼容含义，不能用它们代替当前 REGISTRY 或 BASELINE。

## 团队日历

页面和工具代码保持本机 1.0.6 原样；可移植分发 `1.0.6-portable.1` 仅替换 manifest 中固定电脑路径，内嵌原客户端代码，并从每台设备自己的 `CALENDAR_CONFIG` 或 `~/.config/opcb-team-calendar/client.json` 读取连接。配置文件、数据库、账号、任务、截图和 .runtime 不发布。可移植 manifest 因此不同于本机已安装 revision，不能声称它已在本机安装。

先下载完整包，按插件 README 部署本机服务和本人身份连接，再通过 Buzz 原生审核卡安装。完整服务源码、锁文件、构建、测试在 `integrations/opcb.team-calendar/1.0.6`。原工具的 Agent/会话范围限制原样保留；新使用者仍需另行配置自己的授权，收录不等于全员工具已可用。不得通过复制本机凭据或放宽原权限来绕过。尚未接通团队跨设备共享、真实任务中心、腾讯会议自动创建或后台提醒。

## Claude ACP

镜像 `pyus13/buzz-claude-acp` 的本机安装提交 `b72d89baa4257ab9a6257036a070679db89a4532`，保留原 manifest、plugin.js、README、图标和 MIT 版权许可；不修改 ID 或代理身份。安装仍由本人原生审核，Claude Code 登录由各人自行完成，首次运行下载原 manifest 固定的 ACP 适配器。镜像不是上游维护权转移；现有上游来源不自动卸载或换源。

## 验证边界

本机采集时 19 项均 active、error=null。17 项公开快照逐文件与安装来源的完整 Git 提交核对；Claude 原生 artifact 输入与上游固定提交一致；日历 plugin.js 与本机代码一致，manifest 的可移植客户端独立验证本人绑定、请求与错误分支。运行插件仓库完整 `npm run ci`、日历完整包测试、打包校验、发布源与远端下载回读。

发布完成不代表其他电脑已安装、账号依赖可用或通过人工业务验收。没有为本次发布发起批量安装、替换客户端、复制凭据或恢复旧 fork 构建路线。
