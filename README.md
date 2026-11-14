# 公司看板 2.0.0-rc.6

按共享笔记已确认v3标准上线真实数据阅读界面：今日、近期、紧凑任务列表、状态/日期看板、完整月历、项目双栏、任务详情、计划来源与主题。复用真实内嵌圆体、等宽数字与规范对象图标，保留原生私人Solo助手与Agent只读定位工具。

## 数据与权限

唯一共享来源仍为原工作进度频道 Canvas。兼容原「负责人／主要工作／可检查的交付」以及当前「人员／主要负责／边界」表；当前每日执行计划保留原任务编号、交付、验收、阶段和排期说明。同编号相同计划合并引用阶段；内容冲突拒绝读取。边界不能当作交付，缺失数据明示未登记。

没有执行证据的分工/计划显示「执行状态未登记」，完成数不沿用历史，不把待办、已提交或计划当作已验收。相对D0/D1与15日/17日备选日期不擅自选定，留在日期待确认；只有明确登记的合法年月日进入月历。原计划与预算审批状态保留原文。

本版只读；官方桌面Buzz尚未提供已确认的受控CAS进度写回契约，不上线假保存或另建本地账。可打开来源频道核对。另一安卓工作看板候选的canvas.write/recover是独立原生能力，本版不假定官方桌面具备，也不借此恢复定制宿主。

切换账号/社区、撤销成员资格、读取失败后清除正文，不保留先前读取结果。Agent工具继续限制在本人和所属Agent的私人Solo，只能读取/定位，不能写进度。不新增网络、文件、进程或Agent权限。

## 兼容与交付

API1，官方发布/Studio实际Buzz1.0.2/build1.0.2（2026-11-14核对）。使用react/pages/panels/relay/conversation/agents公开服务；依赖session.canvas.read。其他设备按各自宿主API核验，不声称Android/iPad原生完成验收。

源代码src/tasks/company-board.mjs、live-ui.mjs、live-model.mjs和calendar.mjs；node scripts/build_tasks.mjs生成单文件plugin.js。完整检查npm run ci，统一打包python3 scripts/package_release.py。固定分发来源由本轮REGISTRY/CANDIDATES登记，原生审核后由用户安装。保留同一ID和上一版包。字体与对象图标授权见DESIGN_LICENSES.txt；设计基线design-system/v3。
