# 任务中心 2.0.0-rc.12

人只需选择任务、勾选完成、移除，或在原生执行对话里说需求；不再填状态/日期/交付链接表单。

- New task 和 Task actions 菜单通过官方 registerTool/insertText 直接填入唯一的原生输入框。原草稿保留，任务ID/轮次自动携带；由本人使用原生 Agent 接收人和发送按钮确认，不增加指令表单。打开任务、选择菜单均不自动执行。
- opcb_task_flow支持建任务、实际开工、修改、受阻、改期和交付，状态自动写回原Canvas并回读；每轮保持同一ID和revision，不靠排期或泛泛收到推断开工。
- 本人的工作勾选即完成；Agent交付先待验收，勾选确认当前版本。没有有效交付时先让Agent找原消息。取消完成重新打开，不自动生成或付费。
- Select多选与完成方框分开；支持批量移除、撤销。移除保留聊天和产物，停止后续操作；不冒称取消供应商作业或退款。
- 保留Today/Upcoming/Calendar和Inbox/执行对话两栏、原生消息/@/附件。旧checks完工报告统一显示待验收，所有计数同源；旧done验收保留。

新增Agent工具及短指令按本人授权任务使用。仅所属人的Agent、本人及Agent均可读的原执行会话/任务来源可写。普通频道首次需本人在页面关联，已持久关联的任务在关闭页面后仍可在原频道更新。每次变更附原本人指令、任务轮次和操作者；Agent不能自行通过验收，旧结果/重复回执不能覆盖新要求。事件保存到原Canvas的lifecycle-v1区，原分工/执行/检查记录不覆盖。

官方与Studio Buzz1.0.2、API1/macOS；无新增host权限。Agent实际使用新工具才形成闭环，不覆盖其他设备未更新插件或未按工具上报的外部Agent。交付工具核对可读原消息及附件/链接归属，外部原件和业务效果仍由执行Agent检查；本人确认最终效果。旧客户端看不到新增事件，设备分别审核更新。

源码src/tasks，规则TASK_AI_RULES_RC10.md；完整检查npm run ci，打包python3 scripts/package_release.py。隔离宿主契约与界面检查不等于原生真实发送或实体iPad业务验收；固定来源更新卡仍由本人最终确认。

## 常驻使用卡片

插件右下角Help入口可点击展开/再次点击收起，关闭按钮或Escape也可收起。内容覆盖新任务、选择/修改、勾选验收、查找交付、移除与撤销。卡片初始收起，切换Today/Inbox/执行对话仍可使用；只在本地展示，不发消息、不写任务。

## 原生执行会话

右侧保留 Inbox/执行对话切换，任务背景为一行折叠摘要，移除收入更多菜单，会话选择为紧凑标题栏。编辑器保留官方消息、@、附件、草稿和 Agent 接收人，不自写发送服务、不覆盖原生私有样式。Task actions 提供 Run task / Find delivery / New task，均只填入可编辑草稿；没有选择会话时保留快捷意图等待本人选择。已关联任务打开时复用原执行会话。

原生API依据：block/buzz-app v1.0.2 的 conversation/service.tsx、contracts.ts、MessageComposer.tsx；只使用公开 registerTool、insertText、focus、requireMention、chatPresentation。未增加权限。隔离预览中的编辑器为宿主契约替身，不代表原生外观或实体iPad已经验收。
