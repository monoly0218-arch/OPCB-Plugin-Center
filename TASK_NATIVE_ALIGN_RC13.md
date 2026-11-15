# 任务中心rc.13：任务选择与原生输入框

本人请求：buzz://message?channel=2dbc1afc-1556-4d45-8a35-c6c34e91a651&id=9f3c313d611898c5212df7c74fda52d878b167308a0fc8350032c1ac0d7fe9d7。

左右标题、时间、团队和状态直接共用Reference.TaskCopy，统一字体与元信息。右侧任务摘要补齐左侧已经显示的团队/日期，不新增数据。Task工具改成紧凑工具栏按钮，保持官方Composer及Agent接收人原组件。Solo与频道分别沿用各自的chatPresentation模式；没有自写Agent选择器或另一套输入框。

官方最新v1.0.2、Studio1.0.2/API1核对；rc.12安装审核已approved，本机插件active且无错误。Cua原生观察发现任务摘要小字号和缺少字体属性，与左侧不同；已取得旧运行版实际截图。检查执行会话时窗口切到其他插件，立即停止GUI操作并end_session，不接管其他操作。rc.13正式原生效果待用户审核安装后验收，隔离编辑器不作为真实原生像素证据。

## 当前会话关系与建议（后者待本人确定）

当前任务中心是页面，不是独立执行Agent；右侧选已有Solo/频道，使用里面被指定的Agent。task.executionChannel保存频道关联，没有为任务自动创建Solo，也没有task→sessionKey映射。多个任务可以共用会话；切选中任务不清空或隔离原来的Agent上下文。官方原生规定Solo/DM按整段会话处理，不能把Solo里的任务标题或伪线程当作独立模型上下文；具体session范围仍由Agent类型决定。

建议：统一个人任务中心入口；首次明确执行某任务时建立该任务的私有执行Solo，后续修改/交付/验收沿用同一会话；新任务使用新会话，自行完成的任务不强制创建Agent会话。同一会话里每个Agent有自己的上下文，因此“任务会话”和“Agent进程”不是同一个概念。擦拭放大模板V1–V10沿用同一任务会话，另一个模板另开。

本次只做视觉和原生编辑器对齐，未实施上述会话策略、创建会话或迁移历史；等待本人选择，不把建议当成已授权的架构迁移。

引用：block/buzz-app v1.0.2 src/features/agents/service.ts的AgentConversation/rootInWhole/folderPlace，src/features/conversation/service.tsx的ui.Composer，src/features/messages/MessageComposer.tsx的公开props。无宿主修改，无新增权限，保留原Canvas与Agent状态规则。
