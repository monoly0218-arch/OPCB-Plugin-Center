# 内容工厂 2.0.0-rc.10

修复发送恢复键超过 Buzz 原生 200 字符限制的问题。对明确在入队前被拒绝的旧版指令，点击「核对发送」可原位继续，使用相同制作版本、提示词、备注和附件。若原消息已在队列，核对或重试沿用其消息 ID。发送回执缺失的制作版本显示「待确认发送」。

开始执行直接发送给右侧专属 Solo 当前选定的一个 Agent，不再提供左侧执行人选择。通过公开 ComposerToolProps.audience/recipients 读取当前原生收件人，跟随右侧选择；收件人未就绪或多于一人时不会猜测。首次加入使用原生 channelWrites.addAgents 与有效期检查，修复普通成员接口拒绝添加 Agent 的问题，不改动原生草稿。

「备注」按钮弹窗编辑本轮补充要求，点击开始执行时和完整工作流、所选模板提示词、参考视频及角色／产品图一起发送；备注封存在对应制作版本、历史输入档案及验收工程 NOTES.md 中。下一轮修改备注不覆盖旧版本。左右面板在宽屏等高，左侧内部滚动；平板／窄屏继续上下排列并可收起。

保留 rc.8 独立双提示词及版本、视频同步与替换、角色产品图库手动改名、状态回执、本人验收绿色和真实工程包。自动读取视频单次最多16MB，完整原文件上传最多64MB，不截短。此插件不直接领取账号、不付费、不调用供应商，Higgsfield 仍依赖实际号池插件与本人有效授权；queued只表示指令发送。

ID opcb.content-factory，API1，权限与 rc.8 完全一致。2026-11-18核对官方 block/buzz-app v1.0.5，本机 macOS 1.0.6-preview.1。所需公开API：Solo/Canvas/Workspace/ComposerToolProps.audience/agentChoices/channelWrites.addAgents/messages.send/attachments。实体iPad、原生实装和真实供应商生成分别验收。源码构建 npm run build:factory，完整检查 npm run ci。通过原生审核卡由本人确认更新，不替换宿主或手工安装。
