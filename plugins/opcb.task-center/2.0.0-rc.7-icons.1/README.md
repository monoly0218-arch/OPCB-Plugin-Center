# 任务中心 2.0.0-rc.7+icons.1

本次只更新插件包图标、原生页面导航和已有面板启动图标。采用插件中心同一资源：官方品牌/IP优先，其余Fluent 3D。插件ID、权限、页面ID、业务代码、Agent工具与账号/配对方式保持原基线。

业务基线：2.0.0-rc.7；原运行revision：41a597fe27296530e7e49d6bdc764f9cb340a4a1cf1c7926bdfec9a9e0e13dc5。原JS SHA256：27a5cad1b3d2c66c2b1ba24a79da7ce5f743121e4b68590443e772532cf193e5；未修改的入口见src/plugin-icons/macbook-bases/opcb.task-center。构建时只在注册处补图标，聊天产物的既有频道按钮替换身份图片。

配置与凭据不随包分发；升级仍需Buzz原生审核，是否已安装以实际revision回读为准。

API v1，参考官方与本机Buzz 1.0.2；完整仓库检查npm run ci，构建node scripts/build_plugin_icons.mjs。原生安装、业务、Android/iOS需分别验收。原版依赖见BASE_README.md。图标资源来源及授权见BRAND_ASSETS_NOTICE.md、FLUENT_EMOJI_LICENSE.txt。
