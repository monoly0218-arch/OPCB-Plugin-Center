# 插件中心版本识别与原生更新

## 结果与边界

0.3.5 改为固定线上 REGISTRY + 本机原生清单的包指纹比较。同版显示“已安装”；不同版显示“检查更新”；无法核验时明确待核验。目录默认每线路一张最新卡片，历史可查。号池1.3/1.4不混合。

## 原因与原生路线

旧页面仅调用 getInstallationStatus(id)，所以每个已安装 ID 都显示“查看更新”。旧目录还保留多个非legacy版本，导致相同 ID 多张卡。旧 validateRegistry 强制把 reviewSource 地址补 `.git`；官方 PluginImport 对同源更新按原地址字符串和路径核对，这会让部分无后缀的本机源被视为不同来源。此阻挡由源码确认，旧截图的具体审核失败仍不可单凭关闭提示确定。

最初只查 pluginInstaller.compareInstallationRelease，误判未签名包必须改官方接口；进一步阅读官方 plugin-architecture 的插件管理部分，找到其明确允许 trusted plugin scope 读取 pluginRequests。使用 `ctx.reflect.get('pluginRequests')`，只调用按当前真实 viewer 归属的 forAgent(...).list()；这是同一原生清单能力，不读私有状态、不接触凭据、不自行审批。更新采用原保存 repository 拼写 + 目录固定 ref/commit，通过原 pluginInstaller.requestInstall 打开原生审核，不修改宿主。

原生列表不提供 publisher。页面的“已安装”只表示本机 artifact revision 与目录一致；不是 publisher 信任或业务权限认证。数据源/账号未接通另行处理。其他仓库或本机文件夹不自动迁移。新版读取失败不复用过期的同版结论。

## 核对版本及源码依据

- 官方发布：https://github.com/block/buzz-app/releases/tag/v1.0.5 （2026-11-18 发布）。
- 本机 /Applications/Buzz.app 为 1.0.5-preview.2；没有升级、安装、替换或重启宿主。
- `docs/plugin-architecture.md` 的 managing plugins 部分明确记录 root context pluginRequests 对插件作用域可达。
- `src/plugins/requests.ts` 的 forAgent.list 返回本机 revision/source；本实现不调用它的任何写操作。
- `src/plugins/installer.ts` 的 requestInstall 只发起本人审核；`src/app/PluginImport.tsx` 执行来源与路径保护。
- `crates/plugin-manager/src/lib.rs` 的 Manifest/HostGrants/Artifact 与 pack_release 定义公开包身份算法。

## 交付规则

固定发布源、插件目录与包校验随本版同步；不修改既有 BASELINE 或把本候选称为已安装。安装后回读 plugin_status 和实际页面状态。模拟审核、原生审核发起、实际安装、桌面与移动端业务验收分别报告。
