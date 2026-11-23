# OPCB 网络助手 0.1.0-rc.1

在 Buzz 的「网络助手」页查看本机 sing-box VPN 连接状态，打开成员安装向导或管理员口令管理。

1. 成员点「下载成员 App 1.1.2」，用有访问权限的 GitHub 账号下载安装包，解压后把 App 放进「应用程序」。
2. 在 Buzz 点「打开网络助手」，输入管理员发放的一次性激活口令，跟随向导安装、授权、导入团队节点并切换。
3. 管理员从团队私下取得「OPCB 口令管理 1.1.2」，解压后放进「应用程序」。展开「管理员发放口令」，用已配置团队服务器权限的 Mac 进行发放。

要求 Apple 芯片 Mac 和 macOS 13+。成员 App 的发布文件 SHA-256 为 `a928493d138af35387faef9f2d2a47865ee6f9899511fa78aa4f850c672186a1`。口令管理从团队 `issuer-handoff` 源分支构建和单独分发。

插件使用 Buzz API 1 的 `pages`、`react` 和 `host.runCommand`。固定命令只读取 macOS 版本与 SFM VPN 状态，或打开两个既有 App。VPN 状态来自 macOS，节点连通性和 DNS 检查仍在原向导中完成。系统扩展授权由 macOS 处理，设备绑定和发行沿用原 App。

开发基线为官方 Buzz v1.0.6，Studio 实际 Buzz v1.0.7-preview.4。两版的页面和命令契约已核对。
