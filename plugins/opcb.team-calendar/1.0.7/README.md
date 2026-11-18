# 团队日历云端版与自动发布

插件 ID：`opcb.team-calendar`，云端版 1.0.7。官方参考 Buzz 1.0.5 / API 1；本机为 macOS / Buzz 1.0.5-preview.2。需要 Node.js 22.13+，不需要启动本机日历服务。日历云端接入沿用原有独立邀请和权限；安装包不包含设备凭据、业务安排或账号。

## 使用

已安装、已连接的日历继续使用原入口和连接。本次目录发布不替换现有本机文件夹安装，也不修改其配置。其他来源迁移仍须经过 Buzz 原生审核。

新设备先从插件中心下载本版 ZIP，解压后运行 `node CONNECT_CALENDAR.mjs`，输入管理员提供的云端地址、本人 Buzz 公钥和本人一次性邀请码。连接保存在 `~/.config/opcb-team-calendar/client.json`；命令不输出长期设备凭据。中断后保留配置并使用相同邀请重试，不覆盖其他连接。已有独立配置可通过 `CALENDAR_CONFIG` 指定。

随后在「插件中心 → 团队协作」审核安装团队日历。插件声明两个 Node 桥接入口：日历请求和修订订阅，沿用原有页面和工具范围。设备绑定和数据权限由服务端决定。已有云端读写与同机双身份测试通过；真实双设备双向同步、移动端和本便携包的原生首次安装尚待验收。Moo 已确认当前原生页面能打开。

## 后续发版

正式目录分支为 `distribution/3dicons-catalog-20261115`，唯一云端源码位于 `integrations/opcb.team-calendar/cloud/`。

1. 修改该目录源码，同时递增 `package.json` 和 `package-lock.json` 中的正式版本。
2. 将改动推送到正式目录分支，触发 `.github/workflows/calendar-release.yml`。
3. 自动构建可移植插件、完整日历测试、仓库完整 CI、分发校验；全部通过后，原子更新云端安装分支 `distribution/team-calendar-cloud` 与插件中心目录。

失败不会发布半套内容；同版本内容不能覆盖，重复执行跳过已发布的相同版本。并发发布遇到远程新提交时停止，由维护者合并后重跑。旧版本及整套 BASELINE 保留。`CATALOG.json` 仍是原历史合集，本次最新版本进入运行中的 REGISTRY 与 CANDIDATES。

可在本机执行相同流程：先安装根目录与云端源码依赖，运行 `node scripts/publish_calendar.mjs --prepare`，再运行 `node scripts/publish_calendar.mjs --push`。Git 使用本仓库配置的人类负责人身份及署名；脚本完整检查后才推送，绝不强推。

插件中心打开或刷新时读取当前目录；Git 来源的日历声明自动检测更新，实际更新仍走 Buzz 原生审核。自动同步目录不等于自动替用户确认安装。源码修改本身不发布：必须递增版本并推送到上述分支。运行配置、账号、共享业务数据和本机文件夹安装均不随 Git 同步。
