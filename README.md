# OPCB 平台手机版设计计划与成果

候选版本 **0.1.0-rc.1**，插件ID `opcb.mobile-design`，页面ID `design`。

## 内容

- 计划：社交动态→首页；对话与状态→OPCB Agent聊天；人物发现→上传图片和执行制作；个人主页→下载发布；直播／路线结果→邀请码。
- 成果：打开本人原执行会话中的HTML附件，或本人主动导入本地HTML。保留手机机身效果、完整流程、原稿对比和独立作者参考。具体页面数量由个人关联的HTML版本决定。
- 执行：复用Buzz原生 `conversation.ui.Tabs` 在右侧打开已绑定的原会话；历史、输入框、附件、Agent选择和发送由宿主提供。不自建聊天、不新建会话、不自动发消息或触发Agent工作。

## 安装与绑定

从正式插件中心固定来源提交发起原生安装审核；用户确认后核对实际revision和active状态。

Agent在本人明确要求绑定的原会话内先调用 `opcb_mobile_design_context`，再以原本人指令ID、该会话实际HTML交付消息ID、读取到的revision调用 `opcb_mobile_design_bind`。插件核对双方身份、当前会话成员、原消息及附件，然后写入个人Artifact preferences并回读。没有修改其他会话的能力；已有绑定不能从另一个会话读取。页面也可由本人主动选择会话；更换后清除旧HTML关联。

公开包只含插件代码和页面对应计划，**不含个人聊天ID、消息ID、当前素材、HTML正文或团队媒体**。安装不会把本机的聊天或素材共享给其他安装者。绑定记录使用当前社区／本人／插件的Artifact分区；此处不承诺跨设备同步。

## 权限与依赖

2026-11-15核对官方稳定版及Studio安装版均为 **Buzz 1.0.2**，API v1。使用 `react/pages/conversation/relay/artifactStorage/agents/browser/host`；`ui.Tabs`按宿主实际可用性检查。没有宿主核心修改、构建、升级或重启。

本版HTML内嵌预览需要 **Mac Buzz、Python 3**。唯一host权限是启动隔离Python只读预览进程：内存中保留本人选定的HTML，只监听随机loopback端口和随机路径，禁止外部网络资源及Buzz IPC桥，关闭页面、切换身份或失去权限时结束。无文件读取、命令、额外网络源、MCP或Agent hook权限。其他宿主缺少内嵌浏览器时明确显示不可用；Android、iOS和真实业务流程尚未验收。

原消息／附件每次打开重新核对；401/403、编辑删除、撤权、身份变化均不沿用旧内容。只支持自包含HTML，最大50MB；不连接生成、短信、注册或发布服务。HTML中的下载等行为由设计稿本身决定，不能据界面推断生产功能已接入。

## 验证与来源

完整检查 `npm run ci`，打包 `python3 scripts/package_release.py`。包含本人原指令、DM、成员撤权、跨社区、错误来源、并发绑定和回读的回归。原生实际加载、会话打开和个人绑定需审核安装后核对，不以隔离测试代替。

预览管线复用本仓库HTML阅读器 `0.1.0-rc.2`，通过构建打包为单一ES模块；不依赖另一个插件已安装。源码在 `src/mobile-design`，构建脚本 `scripts/build_mobile_design.mjs`。

视觉参考：[Ayo / Revmp](https://x.com/akwaabaaa/status/2102046830846439432)。设计方法参考 [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop)，CC BY4.0。公开包不再分发作者截图；个人HTML保留其原有来源。
