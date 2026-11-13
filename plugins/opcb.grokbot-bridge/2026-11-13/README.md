# Grok Bot 连接器

将已有 Grok Bot 作为独立 Agent 接入指定 Buzz 普通频道；回传需在设置中启用 HTTPS 8443

版本：2026-11-13 Studio 已安装代码快照。原产物 SHA256：`02c1aafaf95971c71904e48af22ffa62a47a23638cb0125157ed7e2934d41088`。

## 依赖与边界

桌面端需要 python3、已有 Grok Bot Webhook 和本人配置的密钥；回传需单独配置 HTTPS 接收服务。

## 安装

请让 Buzz Agent 从 `monoly0218-arch/OPCB-Plugin-Center` 的 `plugins/opcb.grokbot-bridge/2026-11-13` 发起安装审核卡，固定仓库提交；由使用者审阅能力和依赖后确认安装。GitHub 下载与上传均不等于安装或授予业务权限。

## 验证

本次验证包含 manifest/入口文件完整性、JavaScript 语法、ZIP 内容和 SHA256 校验；不是所有设备的业务验收。无本次重新构建。
