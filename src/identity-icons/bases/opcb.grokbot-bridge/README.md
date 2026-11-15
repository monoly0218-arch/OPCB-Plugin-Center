# Grok Bot 连接器 2026-11-13-icons.1

本次只更新插件包图标、原生页面导航和已有面板启动图标。采用插件中心同一资源：官方品牌/IP优先，其余Fluent 3D。插件ID、权限、页面ID、业务代码、Agent工具与账号/配对方式保持原基线。

业务基线：2026-11-13；原运行revision：02c1aafaf95971c71904e48af22ffa62a47a23638cb0125157ed7e2934d41088。原JS SHA256：4c87438dc726598674a98e03eb3e0ba345adce54adec87e1256763035fc3be7e；未修改的入口见src/plugin-icons/bases/opcb.grokbot-bridge。构建时只在注册处补图标，聊天产物的既有频道按钮替换身份图片。

配置与凭据不随包分发；升级仍需Buzz原生审核，是否已安装以实际revision回读为准。

API v1，参考官方与本机Buzz 1.0.2；完整仓库检查npm run ci，构建node scripts/build_plugin_icons.mjs。原生安装、业务、Android/iOS需分别验收。原版依赖见BASE_README.md。图标资源来源及授权见BRAND_ASSETS_NOTICE.md、FLUENT_EMOJI_LICENSE.txt。
