# OPCB 原作页面复刻 · v3 候选

本轮按用户要求以原作为验收依据，不套用界面设计Skill的通用建议。以Woday为主，Sphere宽双栏单独保留，见 [PAGES.json](PAGES.json)。共有19个原作页面或交互状态，另设字体对照、中文知识库适配两页，不将这两页计作原作复刻。

## 字体、数字和对象

- 英文内容与数字默认采用实嵌Nunito；Quicksand提供形态对照。中文采用Resource Han Rounded简体常用字子集，真实400、700字重。菜单与控件仍用系统字体，Sphere独立使用原作的专注状态条。原作字体未恢复，不能声称这就是Woday原字体。
- 标题约34px/760，内容14.5px/700，辅助12px；中文标题31px/700、条目15px/700。日期与计数使用圆体lining/tabular设置；Sphere顶部计时器按原图保留等宽数字，单独核对0–9、07:30、12:34、25:00、2/4、8、44、124与×100。数值由本轮校准采用，并非提取原程序Token。
- Woday立体对象使用Microsoft Fluent Emoji的256px透明PNG作为固定替代，按20–44px呈现，不再依赖操作系统Emoji字体；Sphere分类使用彩色实心矢量符号；导航、工具和设置使用另一组一致的细线控件符号。未证明Fluent是原作者使用的资产包。

字体与图像均在本地随包提供，授权见fonts/各OFL及FLUENT_EMOJI_LICENSE.txt。字体子集重命名为OPCB前缀；中文覆盖GB2312字符，罕见字回退系统字体。完整来源、哈希与子集规则见 [FONT_SOURCES.md](FONT_SOURCES.md)。原作参考封面仅在审阅附件里按图像区域呈现，不是正式业务封面。

## 页面与交互

Today、近期分组列表与日期看板、日历、任务列表详情、笔记总览、Lisbon正文、Work集合、Appearance、快速入口Today/创建日程/AI回答、菜单栏今日/笔记、新建笔记、多级任务、图标与日期弹层、Sphere。

页面为真实DOM/CSS，按钮、搜索、勾选、笔记编辑、对象打开与返回、图标/日期选择、字体和设置切换在本页工作。尚未实现的筛选、完整事件编辑、上传等入口明确显示为参考控件；AI是预置原作内容，未调用模型。没有写入业务服务，刷新清空本页状态。深色与窄屏是适配状态，不能据此宣称原生端通过。

## 共享接入

消费方复用createUI(ctx.react)，styles来自scripts/build-styles.mjs的bundleStyles()，并将返回的css和assets在构建时静态合入插件。默认只打包Nunito及中文两字重；需要字体比较时才includeAlternate。不要在运行时读取磁盘或从字体CDN加载；消费插件同时附带字体OFL与Fluent MIT授权文件。scope为.opcb-v3，避免与旧版预览或未来消费者发生样式冲突；内部组件接口延续，v1/v2目录保留；本轮未迁移任何已安装插件。

通过icons.mjs的createColoredIcons(ctx.react)使用Sphere分类符号，createControlIcons(ctx.react)使用控件符号；Woday对象图像使用bundleStyles返回的assets[name]。Workspace支持font、theme、language及原有布局属性。业务自己的内容、权限、状态和宿主布局仍由消费插件负责，不使用本预览的英文参考文案作为生产资料。

构建独立预览：node design-system/v3/scripts/build-preview.mjs。离线审阅版指定OPCB_REFERENCE_ROOT，内嵌19张公开参考和两张封面区域。默认源码预览通过已提供的公开图片URL对照，字体与对象图标不依赖网络。所有字体授权同时内嵌在HTML尾部的可展开说明中。
