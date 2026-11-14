# Today、Upcoming与Calendar参考还原

请求：buzz://message?channel=2dbc1afc-1556-4d45-8a35-c6c34e91a651&id=991756d529a653c5731973e56ab2622f3584c1240843997e5e647c27fe8ffce1

## 方向与差距

- 产品：用同一真实任务来源安排每日工作与近期交付。
- 性格：安静、紧凑、清楚。
- 场景：黑色导航旁的独立纸面；英文菜单、中文工作内容。
- 重点：Today日期条与状态颜色；Inbox始终保留未排期任务。
- 识别：当前日橙红色，项目用轻标签，工作状态同时提供文字。

原样板已有Woday结构，但生产Today退化为普通分组列表。此轮直接接入生产组件，默认Today；参考Woday OFFICIAL_1、OFFICIAL_2、OFFICIAL_7、OFFICIAL_3的日期、分区和比例，不复制系统窗口按钮或虚构原作功能已接通。

顺序：先实现Today并渲染对照，再用同一行组件接Upcoming列表/日期看板与Calendar。字号与字体、白底/深色面板、轻分隔、状态颜色、44px触控与焦点、无日期/错误/详情返回按真实行为检查。字体为已授权Nunito及Resource Han Rounded，不声称获取了Woday原字体。

只发布任务中心rc.8候选。公司看板rc.8是共享源码一致性的内部构建，未上架或安装。原rc.7及既有业务数据保留。本轮未将修改合并到main或替换原生运行版。

## 时间与业务边界

北京时间每30秒更新；跨日时仅跟随原本正在看「今天」的选择，不重置用户浏览的其他日期。日期条可跨月、跨年；Upcoming未来30天列表和7天看板共享ID。Inbox过滤已验收逾期工作；不把未知日期放进今天。

现有Canvas记录没有确认钟点字段，正式日历仅能使用已确认日期并在「时间未登记」中展示；小时网格支持已有明确钟点的只读对象，预览钟点为标记清楚的演示值。未修改持久化格式或以计划建议填充真实日历。Notes/Events没有来源契约，菜单禁用并说明原因。

离线预览构建：node scripts/build_task_reference_preview.mjs /绝对路径/TODAY_PREVIEW.html。预览与正式任务中心共用createTaskWorkspace，未调用生产服务，未修改Canvas。

方法：界面与信息可视化Skill，基于Damir Sokolovsky的Unslop流程，CC BY4.0；保留仓库原许可与署名。
