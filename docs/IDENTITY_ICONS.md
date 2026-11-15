# OPCB插件图标与版本绑定

本人要求全部OPCB插件使用3dicons.co，并随各插件更新同步。17个OPCB插件ID；号池1.3/1.4两条业务线共18包。不修改Buzz内置插件。

方向：工作与创作工具的统一入口；彩色、立体、易识别；V1材质/dynamic角度；色彩集中在导航和卡片；包、导航、目录、聊天审核卡共用透明原图。保留已有布局和交互。

每个自包含plugin.js内嵌原始PNG，icon.png/IDENTITY.json包含相同哈希。更新该插件即可同步图标，无独立图标插件、运行时图标请求或额外权限，不静默替换已装插件。

src/identity-icons/SOURCES.json记录资源和许可；assets为原图，icons.mjs由构建生成。RELEASES.json记录固定公开业务基线及候选。BASE_README、旧版目录/ZIP保留。保留公司看板rc14、任务中心rc17、工厂/资产库rc3、会话HTML阅读器rc1、Mobile rc8；中心0.3.3保留0.3.2的GitHub请求标识及原聊天安装卡/贡献者。

REGISTRY/CANDIDATES登记新固定来源。CATALOG.json及旧合集为历史快照，不当作当前全套。中心0.3.3从同一正式仓库的distribution/3dicons-catalog-20261115读取当前发布目录，先解析完整HEAD再按提交读取REGISTRY，审核沿用各项reviewSource。后续发布需同步这个实际目录来源，不能只改main；没有新增分发仓库或服务。

## 后续业务更新

1. 在最新实际业务基线上维护RELEASES的basePath/baseVersion/codeSha256与新版本路径，避免从图标快照回退业务；不得放入账号、配对、私人HTML和会话数据。
2. 使用共享withPluginIcon和build_identity_icons.mjs的bundleIdentity内嵌统一身份图。保留原功能按钮；不增加连接器页面。新源码构建也须接入同一规则，再登记REGISTRY。
3. npm run build:identity；python3 scripts/package_release.py；npm run ci。check_identity_policy检查所有非legacy当前版本的原图、运行时URI、IDENTITY哈希，遗漏即失败，阻止业务更新退回旧图标。
4. 同步独立分发和正式发布目录，通过固定提交Buzz原生审核卡交付。目录发布、人工审核、安装及业务/移动端验收分开记录。

图标均V1 color/dynamic，CC0 1.0 Universal，原作者Vijay Verma / realvjy。每包保留来源与哈希；旧业务许可证继续随包保留。PNG没有重绘、裁剪、改色、缩放或抠图。

官方与Studio基线Buzz1.0.2/API1；Mac/官方PageIcon隔离检查不代表实体iPad/Android/iOS业务验收。更新遵循原插件与宿主生命周期；本轮不发送业务测试消息、不改任务和权限。
