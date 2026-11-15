# HTML 阅读器 0.2.0-rc.2

单页个人工作区：收藏置顶，最近打开直接列在下方，所有卡片显示来源会话；取消“当前会话 / 最近 / 收藏”三选一标签和会话下拉，不再进入空列表后找不到已读文件。卡片星标直接收藏，返回工作区保留全部可读记录。

## 快照与正文

工作区快照限定为 16:9、9:16、4:3、3:4；自动按文档宽高选取，可在顶部手动切换四种比例。长页只展示标准比例的首屏快照，不再把完整长页压缩成细长卡片。原文自己的响应式布局会随视口变化；快照是隔离的 HTML 渲染，不冒称栅格截图。

点卡片后，正文使用阅读区的实际宽高与 100% 缩放，保留网页滚动和交互；不把整页 contain 成一张小图，不强制沿用快照比例。铺满按钮在同一 Buzz 窗口展开，Escape 还原；系统级全屏仍由 Buzz 原生窗口控制。

## 来源、权限与绑定

个人阅读记录、收藏与已安装 rc1 保持同一存储结构；不重置历史、不保存 HTML 正文。单页显示本人已打开且当前有权读取的来源；未打开的聊天历史附件不自动扫描。收藏仅为个人标记，未承诺跨设备同步，不代表审核或分享。

从聊天附件直接打开；Solo 按实际连续会话绑定，DM 与普通频道线程分别隔离。独立工作区选中文档后关联其来源会话，Agent 仍需调用 opcb_html_reader_context，并用 expected_revision 检查关联新成果。来源删除、变化、撤权后清空文档预览；来源失效不遮住其他仍可读记录。

沿用 rc1 的权限与进程：官方 Buzz 1.0.2、Plugin API v1、macOS＋Python 3；host grants 不变，没有新增网络/文件权限。每份 HTML 最多 50 MiB，预览总量 160 MiB，个人最多保留近期 60 项及收藏 40 项。sandbox 无同源权限，禁外部资源/网络/宿主桥，正文仅在预览进程内存。

## 构建与验收

源码 src/html-reader；构建 node scripts/build_html_reader_session.mjs；完整检查 npm run ci；打包 python3 scripts/package_release.py。

EGO 的本地宿主 facade 使用合成文件验证收藏、四比例、横竖与长页、滚动、铺满与窄屏，不能代替安装后原生 WebView/分栏人工验收。Android/iOS 未验收。通过 OPCB-Plugin-Center 固定提交的原生更新审核卡交付，保留本人最终安装审核。

设计方法参考 Damir Sokolovsky 的 [Unslop](https://github.com/heydamir/unslop)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，经本地“界面与信息可视化”Skill 适配；字体和图标保留原包许可。
