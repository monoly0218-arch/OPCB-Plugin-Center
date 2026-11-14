# 知识库：共享密码版

版本：2026-11-13-password；插件 ID 保持 `opcb.knowledge`，Buzz 原生 API v1。

任何成员或 Agent 持服务管理员提供的共享密码，可以只读访问当前配置的知识源。插件提供目录、搜索与正文；密码由服务端验证，不随安装包分发。

## 来源与维护

本仓库是后续统一维护、发布和安装来源。manifest.json 沿用已交付的共享密码候选；plugin.js 保留其认证与查询逻辑，合入 Studio 已安装的 Tabler books 图标，附 icon.png 与 MIT 署名；原维护提交 `9ad61ca4c596d8ef3033a3c890e63b4bef48bde3` 只用于历史追溯，不继续旧 fork 的宿主开发或 CI。

此前无 README 的双文件产物 revision 为 `bfbc5dc7a1a7bc465249152ac765f9fd3d5ff76a98959103834795f94a95f2ce`。本目录包含安装说明与已安装图标，宿主产物 revision 不同，应同时核对来源提交、入口文件和实际安装回执，不能只按旧 revision 判断。

## 依赖与权限

需要 `https://shangliangshan.paolab.cn` 的知识库服务和管理员提供的共享密码。仅声明该域名网络访问，无新增宿主进程、命令或写入知识源权限。2026-11-13 服务端已切共享模式；旧邀请码版保留作历史，不适合直接回装到当前服务。

Agent 使用同一服务：向 `/opcb-plugins/knowledge/api/client/login` 提交 viewer 与 password，取得 12 小时 Bearer；使用 client/query 查询，client/logout 注销。遵循服务 Origin、X-OPCB-Client 和只读请求契约。viewer 用于会话分区，不证明账号或 Agent 归属。

## 安装与验收

使用本仓库 REGISTRY.json 中本版本的 reviewSource 分支、完整提交和路径发起 Buzz 原生审核，由用户最终确认。跨仓库或本地文件夹来源不能假装原地换源；按 SOURCE_MIGRATION.md 处理，不改注册表。

官方参考为 block/buzz-app v1.0.1（2026-11-13 发布）；Studio 安装包 CFBundleShortVersionString/CFBundleVersion 为 1.0.1/1.0.1，桌面 macOS ARM64。所用 React、pages、host.request 和身份/原生控件能力按当前宿主 API v1 核对；不将包版本等同所有平台业务验收。

服务端专项 Node 18 项、Python 56 项及真实索引隔离验证通过；上线后网页、桌面接口与 Agent 正误密码、4源目录、搜索、正文、写拒绝、注销验证通过。MacBook 已安装双文件版本并 active；用户手动登录、搜索和正文验收仍待完成。中心完整包检查按 npm run ci 执行。未重新构建 Buzz，Android/iOS 未验收。


## Android 2.0.0 候选

沿用插件 ID 与正式业务来源；需要扩展移动插件宿主（API v1、移动能力 v1），构建18不能直接启用。桌面旧版本保留。网络、消息与业务站点通过原生审核的最小权限接入；不提供远端 Agent 工具执行。

消息附件在宿主原生对话中预览、下载；业务网站通过独立原生页面操作。业务身份、私有数据权限与登录仍由原服务管理。候选不代表服务已部署或真机验收。
