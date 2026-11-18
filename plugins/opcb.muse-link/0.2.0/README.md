# Muse 连接器 0.2.0

你本人可以在所有已包含 Muse Agent 的频道、Solo 和私信提及它，不再选择或保存单一频道。旧版 `config.channel` 保留但不再限制范围。仅把本次提及的文字交给既有电脑 Muse Link；不扫描或转发其他会话与历史。频道回复原线程，Solo 和私信在聊天顶层回复。

使用同一个 Muse Agent、拥有者身份、既有 Mac 独立配对和本地 socket。仅接受 Agent 拥有者的新提及，普通成员或其他 Agent 不可代为触发。Buzz 原生成员与写入权限持续生效：你与 Muse 必须都在目标会话，权限或会话类型变化时停止回传。插件不自动加入任何会话，不以你的身份签名。

先保持 Studio 的 Buzz 和 Muse Link 运行，在目标会话的成员中加入 Muse，再由本人提及发送「只回复收到」。普通频道、频道线程和 Solo 的真实回复分别验收；不要重发可能仍在执行的旧请求。连接器一次仅处理一条请求，文字上限 50000 UTF-8 字节，超时、取消和失败均不自动重试。

桌面依赖 Python 3 与已部署的 Muse Link；没有修改配对、SDK、手机或圆屏。支持从手机发送本人消息、由运行中的 Studio 桌面承接；不代表手机能独立运行电脑桥接进程。

兼容核对：官方最新稳定版 `block/buzz-app v1.0.5`（2026-11-18 发布），Studio 实装 `1.0.5-preview.2`，插件 API 1。使用原生 `agents.register`、`Delivery.channelId`、`AgentHandle.publish(template, check)`、`agents.relay(agent.key)` 与公开只读 ChannelSummary；核对了这两个 tag 的公开源代码，不升级或修改宿主。保留原 `host.processes.bridge` 权限，没有增加网络、文件或身份权限。

离线检查：`npm run ci`，涵盖源代码与包的真实调用回放、身份/会话权限、Solo 顶层路由、取消与晚到结果；打包 `python3 scripts/package_release.py`。离线通过不等于更新已安装或 Muse 实机收发已验收。经固定来源与提交的 Buzz 原生审核卡更新，保留本人最终确认。

继续内嵌统一 3dicons V1 mic 图标与原许可，见 `THREEDICONS_NOTICE.md`。设置说明遵循本地「界面与信息可视化」方法（原 Unslop，Damir Sokolovsky，CC BY 4.0），无新增页面或第三方视觉资产。
