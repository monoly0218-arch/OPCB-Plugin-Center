# OPCB 网络助手 0.1.0-rc.3

在 Buzz 打开「网络助手」。支持 Apple 芯片 Mac、macOS 13+ 和 Buzz 桌面端。

## 首次使用

1. 输入团队发放的一次性口令，激活这台 Mac。
2. 按左侧步骤检查网络、安装官方签名 sing-box，并按系统提示完成网络扩展与 VPN 授权。
3. 获取团队节点，在 sing-box 确认导入，回到 Buzz 点「我已导入」。按检查结果退出旧代理或启动 VPN。
4. 点「开始验证」，查看 Hysteria2、VLESS Reality、分流 DNS、Buzz 和网站连通性。

## 日常使用

已走完流程的设备打开后直接显示网络检查和连接验证。点「开始验证」会先读取最新本机状态，需要修复时进入相应的激活、安装、导入或启动界面。兼容原 OPCB App 与 0.1.0-rc.2 的节点导入确认记录。若本机没有团队激活记录，已有 sing-box 连接也会显示激活步骤。

管理员可使用右上角「管理员发放」，检查服务器后输入或随机生成口令、设定有效期并发放。管理员沿用已授权的团队服务器 SSH 别名和主机校验。

## 构建

页面沿用团队原 App 有权使用的 OPCB 标识、安装指引图片、配色和布局。来源为 `issuer-handoff` 的 `ea67f42b1b84074a086b2d46583160f3c526c97c`。窄栏使用横向步骤。系统弹窗由 macOS 和 sing-box 显示。

插件通过 Buzz API 1 的 `pages`、`host.runCommand` 和 `host.spawn` 工作。官方参考 v1.0.6，Studio 为 v1.0.7-preview.4。使用仓库 Node 依赖和 Apple 芯片 Mac 的 Swift 工具链运行 `node plugins/opcb.network-helper/0.1.0-rc.3/source/build.mjs` 可重建入口和清单。
