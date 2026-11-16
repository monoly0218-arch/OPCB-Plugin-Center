import {monday,localToday,addDays} from '../src/dates.mjs';
export function emptyState(){return {name:'设计团队',timezone:'Asia/Shanghai',demo:false,members:[{id:'moo',name:'Moo',initial:'M'}],projects:[{id:'general',name:'团队事务',color:'blue'}],tasks:[],allocations:[],plans:[]};}
export function demoState(){
  const week=monday(localToday());
  const members=[{id:'tao',name:'涛子',initial:'涛',role:'视频制作'},{id:'zhou',name:'周洋',initial:'洋',role:'视觉设计'},{id:'moo',name:'Moo',initial:'M',role:'创意统筹'},{id:'lin',name:'小林',initial:'林',role:'产品设计'}];
  const projects=[{id:'brand',name:'品牌短片',color:'blue'},{id:'ootd',name:'秋冬穿搭',color:'purple'},{id:'web',name:'团队官网',color:'amber'}];
  const specs=[
    ['脚本与镜头节奏梳理','tao','brand',0,'doing','确认版脚本与分镜'],['关键镜头素材生成','tao','brand',1,'todo','可用镜头素材包'],['短片一版剪辑','tao','brand',2,'todo','初剪版本'],['穿搭视频转场测试','tao','ootd',0,'todo','转场测试片'],['短片修改与交付','tao','brand',4,'todo','最终交付文件'],
    ['秋冬系列人物定妆','zhou','ootd',0,'doing','第一套定妆图'],['穿搭视觉方向整理','zhou','ootd',1,'todo','视觉参考板'],['品牌画面质感测试','zhou','brand',2,'todo','质感测试图'],['系列主视觉设计','zhou','ootd',3,'todo','主视觉初稿'],['系列视觉内部评审','zhou','ootd',4,'review','评审意见清单'],
    ['品牌短片创意对齐','moo','brand',0,'review','创意方向确认'],['秋冬项目需求确认','moo','ootd',1,'todo','确认的需求清单'],['官网方案内部评审','moo','web',2,'todo','方案评审意见'],['客户反馈整理','moo','brand',3,'todo','修改项列表'],['本周项目交付检查','moo','brand',4,'todo','交付检查结果'],
    ['官网信息架构整理','lin','web',0,'doing','页面信息架构'],['首页设计初稿','lin','web',1,'todo','首页设计稿'],['首页设计细化','lin','web',2,'todo','细化设计稿'],['穿搭项目封面适配','lin','ootd',3,'todo','横竖版封面'],['官网组件与交互检查','lin','web',4,'todo','组件检查记录']
  ];
  const tasks=specs.map(([title,assigneeId,projectId,offset,status,deliverable],i)=>({id:`demo-${i}`,sourceId:`demo-${i}`,sourceKey:'demo',title,assigneeId,projectId,status,dueDate:addDays(week,offset===0?1:offset),deliverable,description:'这是一项用于体验日历的示例任务，可编辑日期、状态与负责人。'}));
  const allocations=specs.map((s,i)=>({id:`demo-slot-${i}`,taskId:`demo-${i}`,date:addDays(week,s[3]),...(i%5===0?{start:'10:00',end:'11:00'}:{})}));
  allocations.push({id:'demo-slot-cut-2',taskId:'demo-2',date:addDays(week,3)});
  tasks.push({id:'demo-meeting',sourceKey:'demo',sourceId:'meeting',title:'示例 · 项目周会',assigneeId:'tao',projectId:'brand',status:'todo',kind:'meeting',meeting:{provider:'tencent',url:'',location:'线上 · 链接待补充',participantIds:['zhou','moo'],joinBeforeMinutes:5,reminderMinutes:10},description:'仅用于界面预览的示例会议；腾讯会议尚未创建，未发送邀请。'});
  allocations.push({id:'demo-meeting-slot',taskId:'demo-meeting',date:addDays(week,2),start:'17:00',end:'18:00'});
  tasks.push({id:'demo-pending',sourceKey:'demo',sourceId:'pending',title:'整理新一轮创意参考',assigneeId:'zhou',projectId:'brand',status:'todo',dueDate:'',description:'尚未安排日期的示例任务。',deliverable:'创意参考清单'});
  return {name:'设计团队',timezone:'Asia/Shanghai',demo:true,members,projects,tasks,allocations,plans:[{id:'demo-plan',title:'本周创意与交付计划',weekStart:week,taskIds:tasks.map(t=>t.id)}]};
}
