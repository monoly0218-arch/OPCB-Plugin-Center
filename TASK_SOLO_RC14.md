# 任务中心rc.14：按需新建任务Solo

本人授权：[加上为当前任务新建Solo执行](buzz://message?channel=2dbc1afc-1556-4d45-8a35-c6c34e91a651&id=57bec79da46eb70df5727caf900cac195c1c5ed4b7e7ff4a9df0b2a213912dcf)。

选择任务后，右侧会话选择旁显示New Solo，Task菜单也有入口。本人点击后建立当前任务的私有、长期、带名称Solo，打开原生输入框并填入任务ID/轮次和可编辑执行指令。没有执行Agent的任务先建立本人空Solo，Agent仍在原生输入框选择；已指定的执行Agent仅在仍属于本人可选Agent且有任务来源权限时加入。本人点原生发送才发消息，不因建会话自动开始工作。此功能按任务主动点击启用，不批量创建，不迁移全部任务。

任务专属Solo确认后入口变成Open Solo，后续同任务/新轮次复用它。仍可阅读或选择有权访问的旧会话；原历史和交付保留，任务工具写回以新绑定的执行会话为准。正在执行且尚未绑定专属Solo的任务先处理现有执行进度，避免工作中途悄悄换会话。

## 同源绑定和失败处理

原Canvas新增独立opcb-task-solos-v1区，保留reserved/submitted/ready过程、操作者、任务/轮次、稳定UUID、原执行会话及原生创建操作ID。创建前保留UUID，只有Relay创建确认、私有Solo类型/创建者/本人权限回读通过后才标记ready并更新executionChannel。任务状态、验收和revision不因绑定变化。旧生命周期及原文区保持不变；旧阅读端忽略新增绑定区，跨设备需审核更新到支持此功能的版本。

每次外部操作前读取最新任务/权限，CAS保护原来源。重复点击、并发以及恢复均使用原UUID；已明确失败的原生创建可以重试同编号，未确认结果先核对原操作/会话，不直接另建。权限撤回、任务被移除、轮次变化、创建者不符及晚到回执不能恢复或重新绑定任务。创建已发生而绑定未确认时保留Continue Solo检查入口，不冒称未创建或已取消。

任务专属Solo的绑定持久化；关闭任务页后，Agent可用opcb_task_center_task恢复当前绑定任务，或用同task_id的opcb_task_flow读取。身份、原会话和任务来源双方权限检查仍生效，未把普通任意Solo变成任务授权入口。Agent开工/交付继续使用原状态闭环。

## 原生边界与验证

本轮核对官方block/buzz-app最新v1.0.2、本机1.0.2、API1/macOS。公开RelaySession.channelWrites.start/starting/delivered/failed/refresh及canvas.save，conversation.ui.Composer及原生Agent选择，未增加host权限，未修改宿主。沿用rc.13共用任务组件、Today/Inbox、Task和Help。公司看板rc.14仅共用源码兼容构建，不替换运行版。

隔离验证覆盖单次创建、重复/并发复用、创建失败、源权限撤回、原生成员不符、CAS冲突、创建期间移除、保留状态与轮次、关闭页面后识别任务及实际开工写回；本机完整npm run ci。隔离编辑器是接口替身，不代表真实原生创建/发送或实体iPad通过。正式任务和真实联系人未被测试操作；安装保留固定版本审核卡和本人最终确认。
