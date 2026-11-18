# opcb.task-center 2.0.0-rc.18-toolbar.1

聊天顶部精简版：聊天产物和任务中心保留单个灰色线形图标按钮，沿用 Buzz 原生 ghost/toolbar 样式；号池邮箱和任务中心测试版不再贡献频道顶部快捷入口。原页面、面板匹配、聊天权限、全部工具与存储均沿用各自基线。包和主导航保留3dicons身份图，频道功能按钮采用原生线形符号。

本包仅修订本机已安装的 2.0.0-rc.18，不合入其他未安装业务版本。原始源码SHA256：440b7d949fe3e3d68668256416af4f345c6d6967eede027a0ae60c1a2d237ddd。原README见 CHANNEL_BASE_README.md，既有字体和图标许可继续适用。

官方 v1.0.5 / Studio 1.0.5-preview.2，API1；无新增权限、宿主修改或自动安装。构建 node scripts/build_channel_toolbar.mjs；检查 npm run ci。macOS原生实际显示待审核安装后验收；移动端未实机验收。插件更新通过固定Git提交的Buzz原生审核卡，保留本人最终确认。
