# HTML 阅读器 0.2.0-rc.1

从聊天附件直接打开，顶部使用内嵌圆润导航：当前会话、最近、收藏。移除本地选择文件、拖入入口与常驻脚注；保留最左侧入口和原图标。文字、按钮与圆润内容框参考 OPCB Mobile Design。

## 来源与会话

附件使用宿主提供的原消息记录，强读取核对附件仍存在后打开。个人 Artifact preferences 只保存来源、会话/线程、选择版本与收藏，不保存 HTML 正文、账号或凭据。最多保留近期 60 项及 40 项收藏（合计至多 100），每次打开仍检查原会话权限。收藏是个人标记，不代表审核与分享；未承诺跨设备同步。

面板的选择绑定打开它的当前频道/线程；独立页面复用原生 conversation.ui.Tabs，打开对应来源执行会话。切换文档只改变阅读绑定，不发送任何消息。Agent 收到插件说明后，在处理“当前这个 HTML”等请求前调用 opcb_html_reader_context，读取其当前执行会话的实时选择。权限或来源失效时拒绝返回；不把其他会话的最近项误当当前选择。

修改成果在本人授权下由 Agent 发布到同一执行会话后，调用 opcb_html_reader_update，传入本人原指令、新来源消息、附件 URL 和读取到的 expected_revision。原指令、作者、频道、线程、当前权限与版本均核对；用户后来切换文档会使旧结果冲突，不覆盖新选择。该工具只关联现有成果，不发送消息或创建会话。

## 完整预览

展示的快照是原 HTML 的隔离实时渲染，非栅格截图。画布完整测量后以 contain 等比缩放，保留竖版、横版及长页面，不 cover 裁切，不放大超过原尺寸。可用 `<meta name="opcb-preview" content="width=1920,height=1080">` 明确原画布；否则读取数值 viewport、移动端提示、单一窄固定容器，再测量完整文档。复杂响应式作品应给出原画布信息；没有元数据时不能承诺猜中作者意图。

每个文档使用无同源权限的 sandbox iframe，脚本可交互，禁止宿主桥、外部资源、网络与同目录文件；仅尺寸信息跨预览边界。保留文档自己的色彩。文档内容仅在 Python 进程内存，关闭、切换身份/社区、撤权或禁用时清理。单文档最多 50 MiB，当前预览总内容上限 160 MiB，超出时明确提示，不伪造已完成的快照。

## 兼容性与验证

基线：官方最新稳定版与 Studio 实际 Buzz 1.0.2，API v1；macOS Buzz 与 Python 3。原 host 进程权限保持，不新增命令、文件或网络权限。额外复用原生 relay、artifactStorage、agents 和会话服务；宿主无截图 API，因此不声称生成了原生栅格截图。Android/iOS 未支持。原生 WebView/分栏与权限变化仍需安装后验收，EGO 浏览器的宿主 facade 测试单独报告。

源码 src/html-reader，构建 node scripts/build_html_reader_session.mjs；完整检查 npm run ci，打包 python3 scripts/package_release.py。固定提交通过 OPCB-Plugin-Center 原生审核卡交付，保留本人最终安装确认。

设计方法参考 Damir Sokolovsky 的 [Unslop](https://github.com/heydamir/unslop)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，经本地“界面与信息可视化”Skill 适配。字体/图标沿用原包许可。
