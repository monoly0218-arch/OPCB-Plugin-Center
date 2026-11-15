# OPCB 平台商业化计划与报告 · 2.0.0-rc.5

在原插件内整合增长内容，保留ID `opcb.results-report`、页面 `report`、Dock入口和当前3dicons图标。顶部Plan／Goals／Timeline／Progress与底部翻页保留，含9张页面：增长图谱（单屏），需求＋模板（分屏），产品路径＋账号私域（分屏），目标＋预算，任务＋详情，内容排期双栏，报告＋数据，视频，手机资料。小屏各半屏上下显示，不隐藏右侧内容。

首页只留关键节点：需求→十篇小红书→体验产品→关注与入群→生成视频；关注小红书账号且加入私域群是生成前置条件。账号、私域并行收集数据后合流复盘，回需求池。点击节点在下方看简要内容；解释与原文默认收起。没有自动限制真实OPCB生成、核验真实关注/群成员或发起支付。

## 数据与编辑

继续读原共享Canvas `7dc199bc-755b-47bb-8f71-fe311b1f1ab1`，原任务ID、轮次、交付、验收、模板/视频/手机资料、`brand-library` / `opcb.results-report.library` version 1不变。与任务中心同源读生命周期，不代记完成。页面打开时自动更新，撤权/身份变化停止展示旧记录，关闭清理订阅和资源。

标题在本机原资料集合的独立 `growth-draft` 偏好项保存，格式 `{schema:1,titles:{C01:"..."}}`，原正式内容排期、任务与发布状态不改；「资料」支持导出标题草稿。编辑转义为文本，空标题或无效编号拒绝。原计划与模板导入/导出仍保留。草稿格式损坏不阻止原计划读取，保存时仍先验证旧值，不覆盖损坏资料。

共享报告沿用schema 1，增补可选指标 `follows/groupJoins/gatePassed/accountReturns/groupReturns`，资料表单、计划导入导出及报告读写均支持。旧记录缺失值仍为未知，真实0保留。旧客户端写回仍可能丢弃其不认识的新指标，跨设备请先更新对应插件。真实数据保存需统计日期与证据，保留版本冲突检查和保存后读回。自动账号/群聊事件采集尚未接入；两路人群不可直接相加，门槛通过必须共同核验。

Demo由本人主动切换，仅显示模拟样本，不写正式数据；收支按实收减退款/生成/媒体/履约，免费补贴是生成成本内的包含项，不重复扣除。12类需求、未有成品的模板名称均为建议，未编入团队私人计划、负责人或真实素材；具体执行与实绩仍读当前身份可访问的来源。

## 兼容、权限与交付

2026-11-15核对官方稳定与Studio均Buzz1.0.2 / API v1，沿用react/pages/relay/artifactStorage与Canvas权限，无新增host授权，不构建宿主。完整检查 `npm run ci`，打包 `python3 scripts/package_release.py`。固定Git提交经Buzz原生更新审核卡交付，用户确认后才安装；候选通过不等于已安装、上线或本人业务验收。桌面隔离宿主验证不代表Android/iOS真机通过。

设计方法参考 Damir Sokolovsky / [Unslop](https://github.com/heydamir/unslop)，CC BY 4.0；OPCB实现：潘涛 Studio。Nunito与Resource Han Rounded许可随包；3dicons V1图标维持当前已安装来源，CC0，见THREEDICONS_NOTICE.md。
