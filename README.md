# HTML 阅读器 0.1.0-rc.1

在 Buzz 消息侧边栏打开自包含 HTML，或从侧栏导航的「HTML 阅读器」选择、拖入本地文件。提供全屏与退出全屏；全屏 API 不可用时说明限制，可使用系统窗口全屏。阅读不改原文件，也不上传文件内容。

## 使用

1. 审核安装并启用插件。
2. 在聊天中点击 HTML 附件卡片，打开右侧预览；原生下载按钮保留。也可用频道的 HTML 入口或侧栏导航打开本地文件。
3. 点击「全屏」阅读；点击「退出全屏」或使用系统退出全屏。关闭文件释放本机预览内容。

## 支持范围与依赖

- 插件 ID：`opcb.html-reader`，API v1；候选版 `0.1.0-rc.1`。
- 参考发布：官方 `block/buzz-app v1.0.2`（2026-11-13）。开发设备实际安装：`1.0.2 / build 1.0.2`；核对日期 2026-11-14。
- 先支持 macOS 桌面 Buzz，需要 `python3` 在宿主 PATH 中。使用公开 `browser.View`、`host.spawn`、pages、panels、conversation、navigation API。缺少能力时显示原因。
- Web、Windows、Linux、Android、iPadOS 暂不支持；浏览器样板通过不代表 Buzz 原生端或实体 iPad 已验收。
- 支持单份不超过 50 MiB 的 UTF-8 自包含 `.html` / `.htm`。内嵌 CSS、字体、图片与脚本可运行；外部脚本、网络请求、外部图片、子页面及同目录资源不加载。需要依赖旁边文件的网页请先打包成单个 HTML。
- 同时开多个预览受宿主原生浏览器会话数量限制；首次版本没有书架、持久缓存或跨设备同步。切换文件会重新载入，交互状态随预览生命周期结束。

## 实现与权限

只声明一个 `python3` 进程权限；不声明宿主文件、外部网络、命令、MCP 或 Agent 工具权限。本地文件由本人通过文件选择器或拖放提供。聊天附件使用宿主提供的已授权媒体 source；权限失败直接报错，不使用公共地址重试。

宿主的页面 CSP 不适合直接执行交互 HTML，`browser.View` 又只接受 HTTP(S)。插件因此通过已审核进程 API 启动内存预览：Python 标准库监听随机的 `127.0.0.1` 端口，仅随机 256 位路径提供该 HTML。无目录浏览、不读写磁盘文件、不生成公网链接；响应禁缓存，限制外部资源和网络。预览显示于宿主无 Buzz IPC 桥的原生网站视图。关闭、切换、禁用时终止进程；宿主退出也结束进程。进程异常后显示重新打开提示。

原生浏览器保留宿主地址、后退、前进与重载控件；插件只提供文件与全屏动作，不修改宿主私有状态、CSP 或窗口实现。系统全屏可用性需在安装后的原生客户端确认。

## 设计来源

遵循共享笔记 `opcb-ui-standard-v3` 与 `opcb-ui-standard-v3-atlas`：内容采用 Nunito、Resource Han Rounded 的真实 400/700 字体；控件沿用系统字体，日期与文件大小采用等宽数字；紧凑工具、44px 触控区、阅读内容占主要空间。使用宿主主题变量，样式范围仅 `.opcb-html-reader`。嵌入网页保留它自己的排版。

字体来自已确认 `design-system/v3@efe1d1e33787bf7fa44f33d70fe3e46402ce7a98`，内嵌构建，无字体 CDN。授权随包提供：Nunito / Resource Han Rounded，SIL OFL。设计方法参考 Damir Sokolovsky 的 [Unslop](https://github.com/heydamir/unslop)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，本地按 OPCB 已确认标准适配。

## 构建与验证

`node scripts/build_html_reader.mjs` 从 `source/` 静态生成单文件 `plugin.js`；生产不导入这些源文件。目录登记在本候选分支的 REGISTRY / CATALOG，ZIP 由中心统一脚本生成，原生审核使用独立分发分支和固定提交。

候选已完成本机进程协议、受限路由与生命周期检查；浏览器流程使用真实已交付的 3.8 MiB 月历和 45.5 MiB 原图册进行检查。安装、原生附件读取、WebKit 全屏及其他设备验收的实际状态见本轮交付回执；批准前不记已安装。
