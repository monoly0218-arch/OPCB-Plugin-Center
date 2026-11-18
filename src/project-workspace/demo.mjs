// Deliberate demonstration only; never seeded into a real channel or saved as business progress.
export function demoProjects(){const projects=[
 {schema:1,revision:0,id:'demo-commercial',level:'company',title:'OPCB 平台商业化',owner:'潘涛',ownerId:'demo-a',status:'doing',goal:'验证从内容触达到产品体验、付费转化的完整商业路径',summary:'体验流程与内容准备并行，下一步核对首批体验反馈',blocker:'首批体验反馈待汇总',decision:'确认首轮体验的范围与结果标准',start:'2026-11-10',due:'2026-11-24',workstreams:[
 {id:'ws-template',title:'模板产出',owner:'潘涛',start:'2026-11-14',end:null,summary:'首版模板已整理，正在核对体验反馈'},
 {id:'ws-xhs',title:'小红书运营',owner:'角色 B',start:'2026-11-13',end:null,summary:'选题已梳理，正在准备首批发布内容'},
 {id:'ws-community',title:'社群运营',owner:'角色 C',start:null,end:null,summary:'首轮运营计划待确认'}
 ],stages:[{id:'A',title:'需求与定位'},{id:'B',title:'内容与产品'},{id:'C',title:'体验与转化'},{id:'D',title:'数据与复盘'}],tasks:[
 {id:'a1',stage:'A',title:'梳理目标客户与体验场景',owner:'成员 A',status:'review',due:'2026-11-16',description:'核对首批体验者的需求和结果标准',channelId:''},
 {id:'a2',stage:'A',title:'确认首轮验证范围',owner:'潘涛',status:'doing',due:'2026-11-17',description:'从目标拆解验证范围，保留人工确认',channelId:''},
 {id:'b1',workstreamId:'ws-template',stage:'B',title:'准备内容与模板示例',owner:'成员 B',status:'doing',due:'2026-11-18',description:'交付可供体验的模板及说明',channelId:''},
 {id:'b2',stage:'B',title:'核对产品体验入口',owner:'成员 C',status:'doing',due:'2026-11-19',description:'检查入口、生成与结果查看流程',channelId:''},
 {id:'c1',workstreamId:'ws-community',stage:'C',title:'收集首批体验反馈',owner:'成员 A',status:'planning',due:'2026-11-20',description:'记录真实问题和后续责任人',channelId:''},
 {id:'c2',stage:'C',title:'核对转化路径',owner:'潘涛',status:'planning',due:'2026-11-22',description:'按验证范围核对，不推算成交',channelId:''},
 {id:'d1',stage:'D',title:'汇总结果与下一轮计划',owner:'潘涛',status:'planning',due:'2026-11-24',description:'用真实证据复盘',channelId:''}],
 events:[{id:'e1',title:'首轮体验评审',type:'meeting',date:'2026-11-18',owner:'潘涛'},{id:'e2',title:'客户现场沟通',type:'travel',date:'2026-11-19',end:'2026-11-20',owner:'成员 A'},{id:'e3',title:'成员请假',type:'leave',date:'2026-11-23',owner:'成员 B'}],
 artifacts:[{id:'art1',name:'商业化路径与阶段计划',url:'https://example.com/plan.html',status:'approved',version:'v1.0',stage:'A',messageId:'',category:'website'},{id:'art2',name:'体验模板与内容样片',url:'https://example.com/sample.mp4',status:'draft',version:'v0.3',stage:'B',messageId:'',category:'video'},{id:'art3',name:'首轮体验问题清单',url:'https://example.com/feedback.pdf',status:'draft',version:'v0.1',stage:'C',messageId:'',category:'document'}]},
 {schema:1,revision:0,id:'demo-brand',level:'company',title:'品牌项目交付',owner:'负责人 B',ownerId:'demo-b',status:'blocked',goal:'交付客户确认的首轮品牌方案',summary:'需求已整理，等待客户补充关键资料',blocker:'客户资料尚未齐备',decision:'确认资料补齐前可先推进的范围',start:'2026-11-12',due:'2026-11-27',stages:[{id:'A',title:'需求确认'},{id:'B',title:'创意执行'},{id:'C',title:'交付复盘'}],tasks:[],events:[],artifacts:[]},
 {schema:1,revision:0,id:'demo-collaboration',level:'company',title:'团队 AI 协同落地',owner:'潘涛',ownerId:'demo-a',status:'planning',goal:'在一个项目中验证人与 Agent 协作',summary:'先确认试点项目与协作规则',blocker:'',decision:'选择首个试点场景',start:null,due:null,stages:[{id:'A',title:'试点准备'},{id:'B',title:'协作验证'}],tasks:[],events:[],artifacts:[]}
 ];
 projects.push(...['内容产品建设','客户体验与服务'].map((title,i)=>({...projects[2],id:'demo-extra-'+i,title,owner:'负责人 B',ownerId:'demo-b',goal:'演示大任务与角色分工',summary:'演示占位',tasks:[],events:[],artifacts:[]})));
 const plans=[
  [['模板产出','商业化方案','首轮体验'],['小红书运营','内容发布','反馈整理'],['社群运营','体验服务']],
  [['项目统筹','客户沟通'],['创意方案','视觉制作','方案校对'],['交付整理','验收跟进']],
  [['协作规则','试点选择'],['Agent配置','执行验证'],['资料整理','结果复盘','团队培训']],
  [['产品规划','模板规范'],['模板制作','示例整理','使用说明'],['体验收集','版本整理']],
  [['服务方案','客户沟通'],['体验准备','问题处理'],['反馈汇总','交付回访','资料归档']]
 ];
 for(const [index,p] of projects.entries()){
  const old=p.workstreams||[],owners=['潘涛','角色 B','角色 C'];
  p.workstreams=plans[index].flatMap((names,r)=>names.map((title,n)=>{
   const prior=old.find(w=>w.title===title);
   return {...prior,id:prior?.id||`demo-${index}-${r}-${n}`,title,owner:owners[r],start:prior?.start||`2026-11-${String(13+(r+n)%3).padStart(2,'0')}`,end:null,summary:prior?.summary||['范围已梳理，正在核对本轮安排','初稿已整理，正在补充具体内容','资料已汇总，等待本轮确认'][(r+n)%3]};
  }));
 }
 for(const project of projects)project.company='OPCB';
 for(const [index,name] of ['上粮山','白酒'].entries()){
  const base=structuredClone(projects[2]);base.id='demo-company-'+index;base.company=name;base.title=index?'白酒品牌内容':'上粮山品牌建设';base.goal='公司层级演示占位';
  base.workstreams=base.workstreams.map(w=>({...w,id:base.id+'-'+w.id}));projects.push(base);
 }
 return projects;
}

// Board examples stay at the original channel/project level; nested workstreams remain nested.
export function demoBoardData(){
 const projects=demoProjects(),owners=['潘涛','角色 B','角色 C'],ids=['demo-a','demo-b','demo-c'];
 for(const [index,p] of projects.entries()){p.owner=owners[index%3];p.ownerId=ids[index%3];}
 const dates=['2026-10-29','2026-11-02','2026-11-06','2026-11-16','2026-11-16'];
 const channels=projects.map((p,i)=>({id:p.id,name:p.title,creator:'demo-a',members:ids,channelType:'stream',createdAt:Date.parse((dates[i]||'2026-11-16')+'T04:00:00Z')/1000}));
 channels.push({id:'demo-new',name:'新项目频道示例',creator:'demo-a',members:ids,channelType:'stream',createdAt:Date.parse('2026-11-16T04:00:00Z')/1000});
 return {projects,channels};
}
