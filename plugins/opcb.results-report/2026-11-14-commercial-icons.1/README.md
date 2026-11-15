# OPCB 平台商业化计划与报告 2026-11-14-commercial-icons.1

本次只更新插件包图标、原生页面导航和已有面板启动图标。采用插件中心同一资源：官方品牌/IP优先，其余Fluent 3D。插件ID、权限、页面ID、业务代码、Agent工具与账号/配对方式保持原基线。

业务基线：2026-11-14-commercial；原运行revision：5be86d974a828a03190fd2234eee17af219b1f510d2457dd37cc39d24d0730b1。原JS SHA256：62d4d15582fee836926666334c36b340cb759608ca326a5ba88dadbe30463ace；未修改的入口见src/plugin-icons/bases/opcb.results-report。构建时只在注册处补图标，聊天产物的既有频道按钮替换身份图片。

配置与凭据不随包分发；升级仍需Buzz原生审核，是否已安装以实际revision回读为准。

API v1，参考官方与本机Buzz 1.0.2；完整仓库检查npm run ci，构建node scripts/build_plugin_icons.mjs。原生安装、业务、Android/iOS需分别验收。原版依赖见BASE_README.md。图标资源来源及授权见BRAND_ASSETS_NOTICE.md、FLUENT_EMOJI_LICENSE.txt。
