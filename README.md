# 任务中心 2.0.0-rc.15

右侧执行会话完整复用 Buzz 原生 conversation.ui.Workspace，由宿主统一读取姓名、头像、身份、在线状态和 Agent 实时活动，沿用 Solo 的消息布局与原生输入框。

- 移除插件手工消息列表，不再遗漏 profile、viewer、session 和活动行；没有维护第二份人员资料或状态缓存。
- Task 继续通过原生工具扩展填入任务草稿，不自动发送。原生 Agent 选择、附件、发送和消息操作由宿主负责。
- New Solo / Open Solo、持久任务绑定、各轮次开工交付、勾选与验收、Inbox 和 Help 保留。
- 本版不创建或迁移真实任务会话，不修改原任务状态，也不替换公司看板。
- 依赖官方 Buzz v1.0.2 / API1 与启用的 Channels 原生插件；缺少 Workspace 时明确提示，不能用不完整列表冒充原生会话。无新增宿主权限。

代码检查使用 npm run ci；包校验按 python3 scripts/package_release.py。官方 v1.0.2 真实 Workspace、Relay store 与 Composer 在隔离数据中验证；没有连接真实社区或发送业务指令。安装保留本人原生审核；实体 iPad 和安装后原业务会话仍待本人验收。

Task快捷菜单使用浏览器原生Popover顶层显示，避免被宿主可滚动工具栏裁切。支持同按钮收起、外部点击、Escape和焦点返回；窗口尺寸变化时收起，快捷操作仍只填入草稿。
