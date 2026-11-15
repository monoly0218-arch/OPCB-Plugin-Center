# HTML 阅读器 0.1.0-rc.2+icons.1

本次只更新插件包图标、原生页面导航和已有面板启动图标。采用插件中心同一资源：官方品牌/IP优先，其余Fluent 3D。插件ID、权限、页面ID、业务代码、Agent工具与账号/配对方式保持原基线。

业务基线：0.1.0-rc.2；原运行revision：6bda9ae850e813704f918c179298cef2590ae8bc26eb8867b864dbf8e60d560d。原JS SHA256：61e5c807ae185ccdbb8f4617dd2ba761be82916b2b066b6ca16dee264874b8fc；未修改的入口见src/plugin-icons/bases/opcb.html-reader。构建时只在注册处补图标，聊天产物的既有频道按钮替换身份图片。

配置与凭据不随包分发；升级仍需Buzz原生审核，是否已安装以实际revision回读为准。

API v1，参考官方与本机Buzz 1.0.2；完整仓库检查npm run ci，构建node scripts/build_plugin_icons.mjs。原生安装、业务、Android/iOS需分别验收。原版依赖见BASE_README.md。图标资源来源及授权见BRAND_ASSETS_NOTICE.md、FLUENT_EMOJI_LICENSE.txt。
