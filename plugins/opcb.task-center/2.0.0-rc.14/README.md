# 任务中心 2.0.0-rc.14

选择任务后，点右侧New Solo为当前任务建立私有专属会话，填入任务ID/轮次和执行草稿。Agent、文字输入、附件与发送完整使用Buzz原生组件；建立Solo不发消息、不记为开工。本人确认发送后，Agent按原任务状态闭环报告实际开工和交付。

- 创建确认后显示Open Solo；后续打开同一任务复用会话。Task菜单也可进入；不批量创建或迁移其他任务。
- 未指定Agent时创建本人空Solo，再从原生输入框选择；已有执行Agent须仍属于本人可选Agent并能访问任务来源。
- 原Canvas保存稳定Solo编号和创建/绑定回执。重复或并发不建立不同编号的会话；失败与未确认结果通过Continue Solo核对。当前身份、任务轮次、原生成员、CAS和移除检查均保留。
- 页面关闭后，专属Solo中的Agent仍可读取绑定任务。普通任意会话不能据此扩大权限；开工、修改、交付和本人验收沿用原规则。
- 保留Today/Upcoming/Calendar、Inbox、同源勾选与计数、移除/撤销、Help、当前图标及许可。

任务仍在原Canvas，新增独立opcb-task-solos-v1绑定区；旧状态和交付历史保留。跨设备需要各自审核更新才识别新绑定。正在执行且未绑定专属Solo的任务不直接迁移执行会话。原生创建已发生但绑定未确认时保留原编号，不能据错误提示断言未创建或已取消。

官方及Studio Buzz1.0.2/API1/macOS，无新增host权限；使用公开channelWrites及conversation API。不改宿主、不重画Agent选择器。源码src/tasks，说明TASK_SOLO_RC14.md，完整检查npm run ci，打包python3 scripts/package_release.py。隔离接口验证不等于原生真实创建/发送与实体iPad验收；安装保留本人原生审核。
