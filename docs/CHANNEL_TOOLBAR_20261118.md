# 聊天顶部入口精简

本人请求：buzz://message?channel=c433203e-90b4-4269-bb02-def322270b18&id=a2b56e676f44f32d0517916b4a28fc99f0e073de83f62f557507944c28ad9eb3

聊天顶部只保留一处产物和一处任务快捷入口。二者沿用左侧原生待办、终端的 `buzz-button` ghost/toolbar 属性、32px 控件与16px线形符号，不显示常驻文字、彩色身份图或描边胶囊；中文名称通过标题和无障碍名称保留。移除号池邮箱、空间和第二处产物的频道启动器，原页面、面板匹配、工具、身份检查、权限和存储不变。

## 基线与兼容

官方最新发布 `v1.0.5`（2026-11-18），本机 `/Applications/Buzz.app` 为 `1.0.5-preview.2`；API1。对照官方 `IconButton`、`Button` 与 `components.css`，复用原生样式属性；仅改变插件贡献，不修改宿主，不安装或升级客户端。

| 插件 | 本机已安装业务基线 | 本次修订 |
| --- | --- | --- |
| opcb.chat-artifacts | 2.0.0-rc.7-icons.1-3dicons.1 | 产物单图标 |
| opcb.task-center | 2.0.0-rc.18 | 任务单图标 |
| opcb.higgsfield-mailbox | 2026-11-13-icons.1-dock.1-3dicons.1 | 移除号池频道启动器 |
| opcb.project-workspace | 0.1.0-rc.15 | 移除空间及重复产物频道启动器 |

新版本均在基线版本后追加 `-toolbar.1`，构建基线哈希见 `src/channel-toolbar/RELEASES.json`。测试版 rc15 与本机文件逐字节比对一致；本包保留其已安装行为，未合入其他会话待审的 rc21 功能。rc15 兼容包标记 legacy，仅作为本轮设备更新源；公开 rc21 线路和待移除请求不被本轮擅自取消。号池1.4线路不变。

包和主导航继续携带原始3dicons身份图与原许可；频道按钮作为功能控件使用线形符号。没有新增 host 权限。未修改 CATALOG 历史快照、BASELINE 整套含义或已安装文件。

## 验证与交付

`node scripts/build_channel_toolbar.mjs --check` 已接入 `npm run ci`。`tests/channel_toolbar.test.mjs` 联合加载四个真实包，与原包比较全部注册顺序、页面属性、权限和工具；核对组合后仅两个启动器、实际目标匹配、点击时的即时可用性与禁用状态。完整测试沿用全仓入口；`python3 scripts/package_release.py` 构建 ZIP 与校验清单。

EGO 使用相同功能控件代码和官方 v1.0.5 样式做隔离验证：深浅主题、32px/16px 几何、产物与任务目标、禁用状态、360px 窄栏。此验证不替代 macOS 原生安装后显示与业务验收；iOS、Android 未实机验收。

独立分发均在正式插件中心仓库的 `distribution/chat-toolbar-<插件短名>-20261118`，REGISTRY/CANDIDATES 固定完整提交。由本人在 Buzz 原生审核卡确认更新；目录发布、卡片送达、安装生效和人工验收分别记录。
