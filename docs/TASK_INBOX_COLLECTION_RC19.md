# Inbox多项收集

用户要求查找未同步且可放入Inbox的任务。原create用频道＋本人指令派生一个ID，同指令第二项会因内容不同而被拒绝。增加可选item_key，每项派生独立稳定ID；不传key保持原ID和原调用方式。仅create可用，不可与task_id并用；限定1—64位小写字母/数字/短横线/下划线，不能选择别的指令或频道身份。仍逐项重读同源Canvas并通过CAS保存，重复原key不重复；不同内容同key拒绝。

原本人请求、双身份权限、会话关联、revision和原始消息核对保持。收集date:null、status:todo、human不设置Agent executor；未调用start，不伪造开工/阻塞/交付/验收。旧30项日期和状态不改，业务与私人来源资料不放公开仓库。

官方及本机Buzz1.0.2/API1。维护rc18全部UI和3dicons，无新增权限。完整npm run ci，原生卡审批后再真实入箱及回读。整套BASELINE r2是已发布历史快照，本候选不静默改写其含义。
