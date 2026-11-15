# 跑圈集团知识库 2.0.0-rc.7+icons.1

本次只更新插件包图标、原生页面导航和已有面板启动图标。采用插件中心同一资源：官方品牌/IP优先，其余Fluent 3D。插件ID、权限、页面ID、业务代码、Agent工具与账号/配对方式保持原基线。

业务基线：2.0.0-rc.7；原运行revision：a00358e07a46e4d05cdc430013c3c9f4216f45bc63f28060a225e0e3263f72e0。原JS SHA256：7bc77b1d1fb92704547f30b64d842361a629d155ef12e9aaed652e63469e2c6f；未修改的入口见src/plugin-icons/bases/opcb.knowledge。构建时只在注册处补图标，聊天产物的既有频道按钮替换身份图片。

配置与凭据不随包分发；升级仍需Buzz原生审核，是否已安装以实际revision回读为准。

API v1，参考官方与本机Buzz 1.0.2；完整仓库检查npm run ci，构建node scripts/build_plugin_icons.mjs。原生安装、业务、Android/iOS需分别验收。原版依赖见BASE_README.md。图标资源来源及授权见BRAND_ASSETS_NOTICE.md、FLUENT_EMOJI_LICENSE.txt。
