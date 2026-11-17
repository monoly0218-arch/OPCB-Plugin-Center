export const PROGRESS_SKILL_NAME='一句话进度';
export const GUIDE_SECTIONS=[
 {id:'update',title:'指南一 · 更新进度',prompt:'用「一句话进度」Skill，核对并更新这些项目的进度。',result:'得到40字以内的「进展，下一步。」'},
 {id:'schedule',title:'指南二 · 早晚更新',prompt:'用「一句话进度」Skill，设定每天9:30、18:30更新进度。',result:'每天两次核对，无新回执则写明待确认。'},
 {id:'blocker',title:'指南三 · 看清卡点',prompt:'用「一句话进度」Skill，查清这个项目的卡点和下一步。',result:'看清当前卡点，以及下一步需要做什么。'}
];
// Portable writing instructions only. No owner's channel bindings, account or timers.
export const PROGRESS_SKILL_TEXT=`---
name: opcb-one-line-progress
description: 核实项目记录，登记40字以内的通用业务进度；用于一句话进度、登记进度、早晚更新。
---

# 一句话进度

固定格式：已核实的进展或当前卡点，下一步动作或待确认事项。
前半句最多18字，后半句最多20字，中间一个中文逗号，结尾一个中文句号；共40字以内，含标点，不换行。
用日常业务语言，不写代码、路径、版本号和工程缩写；具体说明结果，不写空泛的持续推进。
先读取原任务和最新有效回执，保留来源；计划、交付、上线、验收分别判断，没有新回执就写明待确认。
仅在用户明确授权范围内写回原任务，核对当前版本，保存后回读；摘要相同不重复写，冲突或撤权时停止该项。
不代用户验收，不改变人员状态、频道成员和权限，不向他人自动发催办。
用户明确要求定时更新时，再用实际可用的日程设置北京时间每天9:30、18:30；设置成功才报告已设好。
Skill文本本身不是计时器。未配置定时或没有权限时，说明缺少条件，不宣称已自动执行。
`;
