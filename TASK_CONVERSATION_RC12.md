# 任务中心rc.12：原生执行会话

用户要求：buzz://message?channel=2dbc1afc-1556-4d45-8a35-c6c34e91a651&id=d97fa830c6c2850fe2263f4376a4f5840989150cc6ad4210a57d68764184570b。

右侧原先叠加任务按钮、长背景、会话和Agent选择、额外指令表单、原生输入框。现在只保留折叠任务摘要、紧凑会话选择、原生消息与一个原生Composer；移除在更多任务操作中。保留Today/Inbox两栏及常驻Help。

官方公开conversation.registerTool贡献Task actions菜单。Run task、Find delivery、New task通过insertText直接填入原生编辑器，自动携带任务ID/轮次；不自写发送，不创建第二份草稿/Agent选择界面。未选会话时保留快捷意图等待本人选择；拒绝编辑时显示重试，不绕过宿主。发送沿用原生Agent接收人、@、附件、草稿和requireMention；任何快捷动作不自动发送、不自动开工。已关联任务打开时复用原执行会话。状态规则/原Canvas/权限边界保持rc.10。

菜单为统一16px/1.7线条图标配文字，主辅操作区分，减少胶囊和重复说明。任务详情默认折叠，会话正文获得空间。菜单支持Escape关闭与返回焦点，点击外部收起；隐藏或禁用编辑器时关闭。

## 依据与兼容

2026-11-15核对官方block/buzz-app最新v1.0.2（2026-11-13发布）和Studio安装1.0.2，插件API1/macOS。公开service.tsx的registerTool及ui.Composer、contracts.ts的insertText/focus，MessageComposer.tsx的requireMention/chatPresentation支持本实现，无新增权限，不升级/构建宿主。

X参考由EGO/Pantao登录态实际搜索并查看：
- [Michael Filipiuk：AI chat按回合留白](https://x.com/MichaelFilipiuk/status/2121588227476017624)：操作紧靠对应内容，回合间留白。
- [Naimur Rahman：Inbox与AI助手概念](https://x.com/uinaimur/status/2119751541838254355)：紧凑工具栏、清楚分栏，不复制概念中的业务功能。
- [Linear for Agents](https://x.com/linear/status/1925219838483427423)：围绕工作对象的Agent操作参考。

布局继续沿用Woday/v3，方法参考界面与信息可视化/Unslop，Damir Sokolovsky，CC BY4.0。保留现运行版图标与许可。

dev/task-native-fixture.mjs是隔离宿主替身，显示演示数据，不代表官方消息/编辑器的最终像素；真实原生发送与实体iPad仍待用户审核安装后验收。公司看板rc.12仅共用源码兼容构建，不推荐替换运行版。旧rc.11目录和固定分发保留。
