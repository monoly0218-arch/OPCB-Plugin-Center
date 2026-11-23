# OPCB 网络助手 0.1.0-rc.2

在 Buzz 侧栏打开「网络助手」。支持 Apple 芯片 Mac、macOS 13+ 和 Buzz 桌面端。

## 成员接入

1. 在插件页查看健康度、占用的常用端口、旧代理及网络扩展状态，输入管理员发的一次性口令并激活此 Mac。
2. 点「安装 sing-box」，按 macOS 提示安装经 SHA-256 和 Developer ID 校验的官方版本。完成网络扩展与 VPN 授权后，刷新本机状态。
3. 在插件获取团队节点，点「导入 sing-box」并在系统打开的导入窗口确认。回到 Buzz 登记导入。若发现旧代理，确认切换前会先验证团队节点。
4. 在插件启动 VPN 并验证。结果包括 Hysteria2、VLESS Reality、分流 DNS、Buzz 和网站连通性。辅助服务与扩展授权由 macOS 处理。

## 管理员发放

打开「管理员发放」，先检查团队服务器，再输入或随机生成口令和有效分钟数。发放成功后，可以在插件复制口令并私下交给对应成员。每个口令绑定一台 Mac。管理员沿用已授权的团队服务器 SSH 别名和主机校验。重复提交同一口令复用本机发放请求，核对原回执。

## 构建与权限

插件通过 Buzz API 1 的 `pages`、`host.runCommand` 和 `host.spawn` 运行。源码来自团队 `issuer-handoff` 的激活、诊断和发放逻辑。Swift 组件随入口一起打包，由固定权限声明验证哈希后临时运行。激活和节点文件复用用户私有目录，设备密钥由 Secure Enclave 管理，口令通过进程标准输入传递。

首次安装 sing-box 和运行双节点诊断时按需下载对应的官方发行文件。开发参考 Buzz v1.0.6，Studio v1.0.7-preview.4。使用仓库现有 Node 依赖及 Apple 芯片 Mac 上的 Swift 工具链运行 `node plugins/opcb.network-helper/0.1.0-rc.2/source/build.mjs` 可重建入口和清单。
