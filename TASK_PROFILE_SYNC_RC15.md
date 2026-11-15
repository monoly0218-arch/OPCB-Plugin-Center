# rc.15：执行会话身份与活动显示

授权：[修复](buzz://message?channel=2dbc1afc-1556-4d45-8a35-c6c34e91a651&id=6fb82f029482cfbd3e71bd901a3de3d62010ee5f1bd563e46a389c64256021ad)。

rc.14手工调用Message时缺少profile、participantProfiles、viewer、session和Agent活动行，导致公钥缩写、数字头像、缺少Thinking与本人消息左对齐；Composer单独使用完整原生输入框，因此两处呈现不一致。

rc.15改用公开conversation.ui.Workspace，输入为当前Relay session、scope与已授权执行channelId。宿主负责资料读取与订阅、在线状态、活动行、Solo消息布局、消息操作、历史读取、原生Composer及发送；插件只保留任务上下文Provider、Task工具、外层会话选择与NewSolo绑定。不导入宿主私有模块、不复制其源码到插件、不重画活动状态。

Workspace实例按channelId稳定命名，任务切换不混入其他会话；账号/社区变化仍由原Page visit与permission边界重建。宿主能力缺失时显示不可用提示，不降级成缺少身份和活动的列表。目标仍受canExecuteInChannel和原绑定权限约束。没有新增权限、真实会话创建、任务数据迁移或宿主改动。

参考官方v1.0.2公开service.tsx的Workspace getter、ConversationWorkspaceProps与Channels的Workspace provider；Studio实际1.0.2/API1。真实组件隔离验证与原生设备安装后的人工业务验收分别报告。完整npm run ci与分发包检查；公司看板和旧候选版本保留。

Task快捷菜单使用浏览器原生Popover顶层显示，避免被宿主可滚动工具栏裁切。支持同按钮收起、外部点击、Escape和焦点返回；窗口尺寸变化时收起，快捷操作仍只填入草稿。
