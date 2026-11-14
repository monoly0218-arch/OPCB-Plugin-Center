import React from 'react';
import {createRoot} from 'react-dom/client';
import {createTaskWorkspace} from '../src/tasks/live-ui.mjs';
import {addDays} from '../src/tasks/schedule.mjs';
const h=React.createElement,Workspace=createTaskWorkspace(React);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const records=[
 ['确认今日素材清单','done',0,'09:00','OPCB'],['回复项目启动会的修改意见','doing',0,'16:00','跑圈制作'],['核对上粮山经营报表','todo',0,'07:30','上粮山'],['复核知识库的个人权限','blocked',0,'17:00','集团知识库'],['产品方向讨论与资料核对','review',0,'10:00','OPCB'],['整理项目会议与交付记录','todo',0,'19:00','跑圈制作'],
 ['核对视觉参考的字体与间距','todo',1,'09:00','OPCB'],['确认下版演示文件','doing',1,'15:00','跑圈制作'],['整理来源与版本记录','todo',1,'','集团知识库'],['复核团队素材权限','review',2,'12:30','集团知识库'],['提交产品发布文案','todo',2,'14:00','OPCB'],['检查跨设备阅读效果','blocked',3,'14:00','OPCB'],['补充原文件交付说明','planning',null,'','跑圈制作'],['整理获准共享的会议记录','todo',null,'','集团知识库'],['检查上一版任务的验收证据','review',-1,'16:00','OPCB']
];
const tasks=records.map(([title,status,offset,time,project],i)=>({id:'demo-'+i,code:'D'+String(i+1).padStart(2,'0'),title,status,date:offset===null?null:addDays(today,offset),time,project,team:project,assignee:'演示成员A',kind:i%3===0?'assignment':'plan',description:'这是明确标注的演示任务，用于对照参考图的排版与交互。',completionDefinition:'演示交付说明',boundary:'演示数据，不写入正式 Canvas',progress:null}));
function Preview(){const [selected,setSelected]=React.useState(''),[loose,setLoose]=React.useState(false);return h('div',{style:{height:'100dvh',display:'flex',flexDirection:'column'}},h('div',{className:'demo-bar'},h('span',null,'界面验收 · 演示数据 · 使用正式任务组件 · 不连接业务服务'),h('button',{type:'button',onClick:()=>setLoose(v=>!v)},loose?'恢复有日期演示':'模拟未登记日期')),
 h(Workspace,{state:{data:{tasks:loose?tasks.map(t=>({...t,date:null,time:''})):tasks,title:'界面验收样例',source:'',syncedAt:new Date().toISOString()},loading:false},selected,onSelect:setSelected,reload:()=>{}}));}
createRoot(document.getElementById('app')).render(h(Preview));
