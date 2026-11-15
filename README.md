# OPCB 插件中心 0.3.2 · 修复目录请求

修复已安装插件中心却显示“GitHub 暂时限制访问／尚未载入目录”的问题。原生请求补齐 GitHub 必需的 User-Agent；目录和贡献记录使用同一产品标识，不携带账号凭据。403 只有明确的限流响应头或正文才显示稍后刷新，普通拒绝响应单独提示。

保留0.3.1卡片宽度修复、既有字体图标、目录、头像、消息安装卡与固定来源审核。ID仍为 `opcb.plugin-center`，页面为 `catalog`，工具为 `opcb_plugin_install_card`。Host权限仍只有 `https://api.github.com`。

## 基线与验证

官方稳定版v1.0.2，最新预览v1.0.3-preview.2；本机Info.plist为0.7.0-preview.268.1。本机版本[官方host_request.rs](https://github.com/block/buzz-app/blob/v0.7.0-preview.268.1/src-tauri/src/host_request.rs)允许调用方提供User-Agent，原生传输不会默认补齐。没有升级或构建宿主。

对同一公开commits/main接口实测：移除User-Agent返回403和明确的必需请求头提示；补上OPCB产品标识返回200。回归测试覆盖目录／贡献请求、真正限流与普通403的区分。完整检查 `npm run ci`；构建 `node scripts/build_plugin_center.mjs`；打包 `python3 scripts/package_release.py`。

原生安装、启用、目录显示与业务验收分别记录；测试通过不代表设备已安装。固定分发 `distribution/plugin-center-cards-0.3.2`，精确提交见REGISTRY。安装更新继续通过Buzz原生审核；本版本不安装其他插件、不增加文件／进程／账号权限。

字体、图标与Unslop署名及OFL／MIT／CC BY 4.0来源继承0.3.1，许可随包保留。
