# Studio 与 MacBook 的统一插件来源

唯一维护与分发仓库：`monoly0218-arch/OPCB-Plugin-Center`。Studio 与 MacBook 从 GitHub 的固定提交重新检出；保留旧检出和未推提交。目录安装映射以同一提交的 REGISTRY.json 为准，使用 reviewSource 的分支、完整提交和路径 `.`，不再创建其他仓库的分发分支。

## 本轮版本

官方参考：block/buzz-app [v1.0.1](https://github.com/block/buzz-app/releases/tag/v1.0.1)，2026-11-13 发布。Studio 实际安装包 CFBundleShortVersionString/CFBundleVersion 为 1.0.1/1.0.1；此包元数据不等同每个设备的功能证据。插件均使用 API v1。目标为 macOS ARM64；MacBook 的实际版本与运行回执由该机独立核对，Android/iOS 未验收。不安装、升级或重启宿主。

本轮补入共享密码知识库，旧邀请码目录和旧 ZIP 保留历史。其认证与查询逻辑来自已上线服务对应的候选，仅合入 Studio 已安装的 Tabler books 图标和许可证；中心附 README 与 icon.png，产物 revision 与原双文件包不同。其余 Studio 13 项业务目录沿用原审核版本，其中资产库与成果报告是经过脱敏的空白分发版，不等同本机包含私人素材的旧版本。号池保留当前 1.3 选择，1.4 依赖 Moo 本机分配器，不自动升降级。插件中心自身沿用独立 distribution/plugin-center-0.1.0 分支。

## 审核与保留

原生工具的 install 对已有同 ID 插件拒绝重复安装，update 读取原先记录的仓库；Add 的 Git 导入同样显示 Already installed。不能用 update 传新仓库就称已换源，也不能修改注册表、复制安装目录或静默 reload 绕过审核。官方同源更新与跨源迁移是不同操作。

跨仓库或本地文件夹来源需经用户审核移除旧注册，再从本仓库审核安装。移除会删除旧安装产物与回滚历史，不能保证各连接器登录或配对状态不受影响，因此保留用户的删除/安装确认，按设备逐项处理，不先批量卸载。迁移前记录已安装 revision、来源与启用状态，保留原源码和可回装包；不把账号、配对、运行配置或聊天数据库上传到公开仓库。若原生宿主未来提供无需删除的换源能力，须先在当前发布版确认，不能把 main 文档中的新能力当作本机已具备。

完成后以本机原生回读 repository/reference/commit/path、revision、active 与错误状态为准。仅有文件下载或同 ID 已安装标记不算换源；登录、搜索、正文及连接器业务由对应设备按需人工验收。

## 设备专用项

MacBook 的 pantao.muse-status 不在当前业务目录，含机器脚本路径及 Agent/会话绑定，先保留该机专用源码，不复制运行绑定到公开仓库。便携化版本另按该插件实际契约处理，不用同名 Muse 连接器冒充。
