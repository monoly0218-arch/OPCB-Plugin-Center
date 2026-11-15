# 全部 OPCB 插件自身图标同步

范围为 Studio 当前16项外部插件。插件中心0.2.4已经使用相同拼图，不重复更新；其余15项生成独立图标候选。官方与设备均为 Buzz 1.0.2，API v1。通过公开 pages.icon、已有 panel.launcher.icon 和包内 icon.png 对齐；聊天产物的既有频道按钮替换身份图片。不创建连接器的新页面，不改宿主内置插件。

图标与插件中心使用同一资源：Muse 原生玩偶、Grok 圆形双眼、Higgsfield 原生 Logo，其余为已选 Fluent 3D。保留原 ID、manifest/权限、业务入口、exports、inject 与注册 ID。src/plugin-icons/bases 保存未修改的业务基线；图标候选不是业务升级。构建会把注入包装打包为一个自包含 ES module，完整生命周期仍归原插件的 ctx 所有。

## 逐项交付

| 方式 | 插件 |
| --- | --- |
| 同源 Git 更新审核卡（7项） | 聊天产物、公司看板、HTML阅读器、跑圈集团知识库、知识库管理、商业化计划与报告、任务中心 |
| 旧 Git 来源需换源审核（3项） | Higgsfield号池、热点工厂、选题灵感 |
| 文件夹来源需本机原位更新或换源（5项） | 内容工厂、Grok、Muse、上粮山资产库、上粮山电商看板 |
| 图标已一致（1项） | 插件中心0.2.4 |

固定来源、原运行 revision、业务 JS 校验与版本见 [RELEASES.json](../src/plugin-icons/RELEASES.json) 和 REGISTRY/CANDIDATES。号池保留 Studio 当前1.3业务基线；其图标补丁不能当作将推荐1.4降级的依据，目录继续保留1.4推荐项。所有原包保留。

## 来源与数据边界

原生 Agent 更新工具只读取已保存的 Git 仓库，传 repository 不能悄悄替换来源。7项可以直接同源发卡；另外8项虽已准备固定的插件中心候选，换源仍须保留本人的原生删除/安装确认。文件夹版不可把静默 reload 称为审核；本轮不修改这些插件的运行文件、注册表或源文件夹。

资产库当前本机版本含内嵌素材，与公开空白模板不同。公开图标候选明确仅适用于空白模板，不用于覆盖该设备。本机另备图标产物，保留原私有代码和素材，不入 GitHub、ZIP合集或共享截图；采用本机原位更新仍须本人明确确认及原生操作。账号配置、凭据、登录态和配对文件均不进入此次公开产物。

## 维护与验证

构建：node scripts/build_plugin_icons.mjs。完整检查：npm run ci。逐项验证原 manifest/权限/exports/inject、原始 JS SHA256、真实入口注册的 ID 和方法接收者、包 PNG、全部 page.icon、已有 panel.launcher.icon，以及 JS/ZIP/SHA256。BASE_README 和原授权资料随包保留。

后续业务版本不应重新复制旧图标。可复用 withPluginIcon 与插件中心的 pluginIcon 映射，在新业务基线上重新生成，而不是把本轮15个快照当成未来业务版本。各项安装及实际业务流程分开验收；Android/iOS尚未验收，远端 CI 未运行。
