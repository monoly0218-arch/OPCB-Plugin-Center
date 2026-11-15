# MacBook 当前业务基线的图标补丁

潘涛要求将本机插件图标更新为插件中心同款。本次复用已有15项图标方案；其中聊天产物、知识库、任务中心的原图标候选使用了不同于本机的业务版本，故新增3个保留本机业务基线的候选，避免图标更新同时引入新网络权限或业务变化。

固定版本、来源和业务入口SHA256见 `src/plugin-icons/MACBOOK_RELEASES.json`，原包仍保留。三个包在通用目录标为历史候选，不把当前用户的兼容选择改为全员默认版本。其他12项沿用 `src/plugin-icons/RELEASES.json` 中的既有分发。

构建：`node scripts/build_plugin_icons.mjs --releases src/plugin-icons/MACBOOK_RELEASES.json`。完整检查仍为 `npm run ci`；扩展真实入口注册测试，检查原manifest、exports、inject、注册ID、上下文所有权和图标。仅补包图标、页面导航图标与已有面板启动图标；聊天产物替换原频道按钮图片。

本轮官方最新预览和本机实际版本为Buzz 1.0.3-preview.2，稳定版v1.0.2，插件API v1。使用当前公开pages.icon、panel.launcher.icon与包icon.png；不修改宿主或服务。号池仍为1.3，Muse电脑状态保留。原插件说明中的旧验证版本用于历史溯源，本轮安装与实际revision另以设备回读为准。

本机安装不代表Android/iOS验收、外部服务部署或业务读写验收。未合并PR，未改变main的目录默认版本。
