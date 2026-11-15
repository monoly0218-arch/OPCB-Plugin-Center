# higgsfiled号池1.3 · 2026-11-13-icons.1-dock.1

仅将原生主页面入口改为最左侧应用栏（placement: dock）。保留页面 ID、图标、业务逻辑、全部权限和原配置键。不增加位置设置，不修改 Buzz 宿主。

基线为本轮 Studio 实际已安装的固定分发提交 `c8968dac7de89585d0546c597e2664697898dc83`；仅修改 plugin.js 的页面 placement，manifest 与其他文件保持基线。旧版本保留。更新需 Buzz 原生审核及本人最终确认。

验证环境：官方最新稳定版与本机 Buzz 1.0.2；API v1 pages.register 的 dock。完整仓库 npm run ci 与包/校验核验；安装后原生入口及业务仍待本人验收，Android/iOS 未验收。依赖与业务边界沿用下列原版说明。

---

# higgsfiled号池1.3 2026-11-13-icons.1

本次只更新插件包图标、原生页面导航和已有面板启动图标。采用插件中心同一资源：官方品牌/IP优先，其余Fluent 3D。插件ID、权限、页面ID、业务代码、Agent工具与账号/配对方式保持原基线。

业务基线：2026-11-13；原运行revision：c5db7e6b409c60993e5e12d63ec9c6484fbb814f9e3a468079713d88a8b014d9。原JS SHA256：dde8d6044f7810d3ee82915138b625e50aab3207ef4badb9d66761dd0cab7410；未修改的入口见src/plugin-icons/bases/opcb.higgsfield-mailbox。构建时只在注册处补图标，聊天产物的既有频道按钮替换身份图片。

配置与凭据不随包分发；升级仍需Buzz原生审核，是否已安装以实际revision回读为准。

API v1，参考官方与本机Buzz 1.0.2；完整仓库检查npm run ci，构建node scripts/build_plugin_icons.mjs。原生安装、业务、Android/iOS需分别验收。原版依赖见BASE_README.md。图标资源来源及授权见BRAND_ASSETS_NOTICE.md、FLUENT_EMOJI_LICENSE.txt。
