# 日历 0.1.0-rc.2

独立插件 opcb.calendar，包含日历视图和人员卡片两个功能页。日历只收请假、出差、线上会议、线下会议、里程碑；原任务中心普通任务不自动进入。月历突出日期与简洁日程条，右侧并排查看当天安排、详情和编辑。周历以周一开始，全天安排独立显示，重叠的定时事件并列。保留日期、类型/人员筛选、跨天与增改删。窄屏月历显示每日数量。

人员页复用公司看板 rc.17 的黑色照片卡原组件：头像、本人状态、当前事情、今日工作进度。任务与人员状态读取原工作频道 Canvas、原生 profiles/statuses，以及公司看板已有同步记录；缺失照片用姓名占位，未同步不猜测。点击人员卡切换到该人员的日程。无新进度按原卡0%显示，不表示已验收。

## 来源、权限与保存

沿用原公司看板与老任务中心的授权工作来源，在原 Canvas 独立 opcb-calendar-v1 区保存日程，保留任务正文、人员状态和其他插件数据。该来源频道的成员可读取共享日程；请勿在共享备注登记私人敏感信息。当前成员可新增日程，仅登记人或来源创建者可以改删。此处请假仅为安排登记，不表示审批通过，不发送邀请、不改频道成员。

使用宿主原生身份、Canvas CAS 和已确认保存回执；冲突保留草稿并要求刷新核对，不自动覆盖。切换账号/社区、撤权后清除展示并关闭旧监听。页面关闭释放轮询与订阅。真实来源未写入演示日程。

Agent 工具 opcb_calendar：先 read 取得 baselineRevision，收到本人明确指令后用 add/update/remove；写入携带 request_id 与 expected_revision。add 使用原消息ID幂等编号，一条指令登记一项；需登记多项时请逐项指令。仅本人及调用Agent均可读的原会话使用，不把其他聊天当授权。Agent工具与页面使用相同五类验证、权限和保存规则。

## 兼容性、验证与安装

2026-11-18 核对官方最新稳定 Buzz v1.0.5；本机 Buzz 1.0.6-preview.1，API 1。使用 react/pages/relay/agents、Canvas、profiles/statuses；无 host 文件、进程或网络权限，不依赖本机日历服务。旧团队日历、任务中心和公司看板均保持原状。

构建 node scripts/build_calendar.mjs，完整验证 npm run ci，打包 python3 scripts/package_release.py。已测代码和隔离流程不替代原生安装后的真实共享保存与跨设备验收，Android/iOS尚未实测。

通过正式 OPCB 插件中心的固定来源和提交发送 Buzz 原生安装审核卡，由本人确认安装。插件包不含真实人员、照片、私密日程或连接凭据。历史 CATALOG 为固定16项快照，本插件新增至 REGISTRY 和 CANDIDATES，不改旧整套基线。

## 资源与维护来源

人员卡片取自公司看板维护源 feat/company-board-sync-20261115 的 src/tasks/company-person-card.mjs、company-people.mjs、company-model.mjs、company-reports.mjs，对照已发布 rc.17。日历日期算法复用老任务中心。UI方向：团队重要安排；克制、清楚；以公司日程为中心；五类颜色只表达日程类别；人员保留已认可的照片黑卡。

界面方法采用 OPCB 界面与信息可视化 Skill；Unslop by Damir Sokolovsky（https://github.com/heydamir/unslop），CC BY4.0。图标为3dicons.co V1，Vijay Verma / realvjy，CC0；见 THREEDICONS_NOTICE.md。
