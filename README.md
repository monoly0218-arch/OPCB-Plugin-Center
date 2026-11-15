# OPCB 插件中心 0.3.1 · 聊天卡片宽度修复

保留 0.3.0 的黑白圆角、Nunito／中文圆体、原版图标及固定版本原生审核，修复聊天分栏中卡片塌缩为窄条、名称和详情逐字换行的问题。旧版源码和分发保留。

## 实现与范围

Buzz 1.0.2 的消息气泡使用 `width:fit-content`。旧卡在百分比宽度上设置页面级 `inline-size` containment，内在宽度只剩边框与留白。新版独立外框提供 660px 首选宽度并限制为可用宽度；内部卡片不再承担尺寸隔离，响应式查询绑定外框。极窄尺寸将图标与名称分行，操作按钮允许换行。

ID 仍为 `opcb.plugin-center`；页面 `catalog`、工具 `opcb_plugin_install_card`、卡片语法及来源校验保持一致。展开详情不会安装；审核仍经宿主 `pluginInstaller`，取消不会报告成功。Host 权限只有 `https://api.github.com`，不增加文件、进程或账号权限。

## 验证

本轮核对官方最新发布与 Studio 实装均为 Buzz 1.0.2，公开 `registerMessage` 与 `pluginInstaller` 契约可用。复现布局来自该版本 `src/features/messages/Messages.module.css` 的 `messageBubble`、`messageBody` 规则。

`node scripts/preview_install_cards.mjs` 使用实际生产 React 组件、字体、图标和目录 store，外围模拟宿主气泡；安装器为合成实现，页面不会实际安装。用 `qa.layout(width, compact, own)` 切换 280–768px、紧凑／普通及收发对齐。覆盖图标加载、字体、溢出、按钮边界、详情展开收起、取消审核与重复点击。

构建：`node scripts/build_plugin_center.mjs`。打包：`python3 scripts/package_release.py`。完整检查：`npm run ci`。固定分发分支 `distribution/plugin-center-cards-0.3.1`，精确提交见中心 REGISTRY。

组件／气泡复现验证不等于原生设备验收。新版仍须本人在 Buzz 更新审核卡确认，随后核对来源、启用及真实按钮流程；没有在本次更改宿主或安装业务插件。Mac 桌面结论不代表 Android／iOS 验收。

字体、图标及 Unslop 署名继承 0.3.0，OFL／MIT 与 CC BY 4.0 来源说明随包保留。
