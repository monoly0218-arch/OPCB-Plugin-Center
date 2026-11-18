import test from 'node:test';
import assert from 'node:assert/strict';
import {readProject,replaceProject,validateProject,groupProjects,calendarEvents,newProject,elapsedDays,groupWorkstreams,groupCompanies,companyName,channelTasks,channelTaskStats} from '../src/project-workspace/model.mjs';
import {saveProject,canRead,canReadCanvas,canWrite} from '../src/project-workspace/store.mjs';
import {demoProjects,demoBoardData} from '../src/project-workspace/demo.mjs';
import {activeReport} from '../src/project-workspace/report.mjs';
const project=()=>structuredClone(demoProjects()[0]);
test('embedded report selects only its active public owner/component, without copying private storage',()=>{const component=()=>null,record={pluginId:'opcb.results-report',id:'report',revision:'active',component};assert.equal(activeReport([{...record,pluginId:'opcb.project-workspace'}]),null);assert.equal(activeReport([{...record,id:'other'}]),null);assert.equal(activeReport([record]),record);assert.equal(activeReport([]),null);});
test('executive board includes explicit company roots, groups a shared goal once, never expands task rows',()=>{
 const all=demoProjects().slice(0,3);assert.equal(groupProjects(all).length,2);assert.equal(groupProjects(all)[0].projects.length,2);assert.equal(groupProjects(all).flatMap(g=>g.projects).length,3);
 assert.equal(groupProjects([...all,{id:'child',level:'task',title:'改按钮'}]).flatMap(g=>g.projects).length,3);
 assert.equal(groupProjects(all,'商业化')[0].projects[0].title,'OPCB 平台商业化');
 assert.equal(groupProjects(all,'','demo-b').flatMap(g=>g.projects).length,1);
});
test('project document round trips without replacing other Canvas content or approval',()=>{
 const p=project(),original='# 频道资料\n保留人员分工与历史\n';const next=replaceProject(original,p);assert.ok(next.startsWith(original));assert.deepEqual(readProject({content:next},p.id),p);
 p.summary='新进展';assert.equal(readProject({content:replaceProject(next,p)},p.id).summary,'新进展');assert.equal(next.match(/opcb-project-workspace/g).length,1);
 assert.throws(()=>readProject({content:next+'\n'+next},p.id),/重复/);
 assert.throws(()=>replaceProject('```opcb-project-workspace\nnot json\n```',p),/损坏/);
});
test('validation rejects cross-channel, invalid dates, missing stages and duplicate IDs',()=>{
 const p=project();assert.throws(()=>validateProject(p,'wrong'),/格式/);assert.throws(()=>validateProject({...p,due:'2026-02-30'},p.id),/日期/);
 assert.throws(()=>validateProject({...p,start:'2026-12-01'},p.id),/早于/);
 assert.throws(()=>validateProject({...p,stages:[]},p.id),/任务格式/);
 assert.throws(()=>validateProject({...p,tasks:[...p.tasks,p.tasks[0]]},p.id),/任务格式/);
 assert.throws(()=>validateProject({...p,artifacts:[{...p.artifacts[0],url:'javascript:alert(1)'}]},p.id),/产物/);
 assert.throws(()=>validateProject({...p,events:[...p.events,{...p.events[0],id:'bad',end:'2026-01-01'}]},p.id),/日历/);
});
test('calendar keeps roots, milestones, travel and leave distinct; undated projects stay undated',()=>{
 const events=calendarEvents(demoProjects());assert.equal(events.filter(e=>e.root).length,2);assert.ok(events.some(e=>e.type==='travel'&&e.end));assert.ok(events.some(e=>e.type==='leave'));assert.ok(events.some(e=>e.type==='task'));
 assert.equal(events.filter(e=>e.projectId==='demo-collaboration').length,0);
});
function fixture(){const p=project();p.ownerId='owner';const channel={id:p.id,name:p.title,creator:'creator',members:['owner','creator','member']};let head={id:'head1',content:replaceProject('# original',p)},calls=0;const session={viewer:'owner',channels:{list:()=>({status:'ready',channels:[channel]})},canvas:{available:true,read:async()=>head,save:async(id,content,expected,options)=>{calls++;assert.equal(expected,head?.id);assert.deepEqual(options,{preserveApproval:true});head={id:'head2',content};return head;}}};const c={status:'ready',scope:'community',generation:1,session};return{p,c,channel,current:()=>c,get head(){return head;},set head(v){head=v;},get calls(){return calls;}};}
test('save rechecks HEAD, preserves unrelated content and verifies the returned save',async()=>{
 const f=fixture();const result=await saveProject({connection:f.c,current:f.current,project:{...f.p,summary:'更新'},headId:'head1'});assert.equal(result.project.revision,1);assert.equal(result.headId,'head2');assert.ok(f.head.content.startsWith('# original'));assert.equal(f.calls,1);
 await assert.rejects(saveProject({connection:f.c,current:f.current,project:f.p,headId:'head1'}),/已变化/);assert.equal(f.calls,1);
});
test('role and revocation block writes, and ordinary members cannot register themselves as owner',async()=>{
 const f=fixture();f.c.session.viewer='member';assert.equal(canRead(f.c,f.p.id),true);assert.equal(canWrite(f.c,f.p.id,f.p),false);
 await assert.rejects(saveProject({connection:f.c,current:f.current,project:{...f.p,ownerId:'member'},headId:'head1'}),/仅频道创建者/);assert.equal(f.calls,0);
 f.c.session.viewer='owner';f.channel.cached=true;assert.equal(canRead(f.c,f.p.id),false);await assert.rejects(saveProject({connection:f.c,current:f.current,project:f.p,headId:'head1'}),/权限/);
});
test('session switches and member removal during asynchronous reads cannot save',async()=>{
 const f=fixture();f.c.session.canvas.read=async()=>{f.channel.members=[];return f.head;};await assert.rejects(saveProject({connection:f.c,current:f.current,project:f.p,headId:'head1'}),/权限/);assert.equal(f.calls,0);
 const g=fixture();await assert.rejects(saveProject({connection:g.c,current:()=>({...g.c,generation:2}),project:g.p,headId:'head1'}),/连接/);
});
test('registration handles empty Canvas with undefined expected revision and cannot steal owner role',async()=>{
 const f=fixture();f.head=undefined;f.c.session.viewer='creator';const p=newProject(f.channel,'creator','创建者');const result=await saveProject({connection:f.c,current:f.current,project:p,headId:null});assert.equal(result.project.revision,0);
});

test('elapsed calendar days include the first day, cross leap/month boundaries and freeze on the recorded end',()=>{
 assert.equal(elapsedDays({start:'2026-11-14'},'2026-11-16'),3);
 assert.equal(elapsedDays({start:'2026-11-16'},'2026-11-16'),1);
 assert.equal(elapsedDays({start:'2024-02-28'},'2024-03-01'),3);
 assert.equal(elapsedDays({start:'2026-11-13',end:'2026-11-15'},'2026-11-20'),3);
 assert.equal(elapsedDays({start:'2026-11-13',end:'2026-11-20'},'2026-11-16'),4);
 for(const item of [{},{start:'2026-11-17'},{start:'2026-02-30'},{start:'2026-11-14',end:'2026-11-13'}])assert.equal(elapsedDays(item,'2026-11-16'),null);
});
test('management tasks validate independently of fine execution tasks and accept old documents without promotion',()=>{
 const p=project();assert.equal(p.workstreams.length,8);assert.equal(validateProject(p,p.id).workstreams.length,8);
 const old={...p};delete old.workstreams;old.tasks=old.tasks.map(({workstreamId,...t})=>t);
 assert.equal(validateProject(old,old.id).workstreams,undefined);
 const restored=readProject({content:replaceProject('# old',old)},old.id);assert.equal(restored.workstreams,undefined);assert.equal(restored.tasks.length,old.tasks.length);
 for(const workstreams of [false,{},[p.workstreams[0],p.workstreams[0]],[{...p.workstreams[0],summary:'x'.repeat(501)}],[{...p.workstreams[0],start:'2026-02-30'}],[{...p.workstreams[0],end:'2026-01-01'}]])assert.throws(()=>validateProject({...p,workstreams},p.id));
 assert.throws(()=>validateProject({...p,tasks:[{...p.tasks[0],workstreamId:'not-present'}]},p.id),/任务格式/);
});
test('management progress and elapsed dates round trip with the same channel revision and access checks',async()=>{
 const f=fixture(),next=structuredClone(f.p);next.workstreams[0].summary='模板已校对，正在等待本轮反馈';next.workstreams[0].end='2026-11-16';
 const result=await saveProject({connection:f.c,current:f.current,project:next,headId:'head1'});
 assert.equal(result.project.revision,1);assert.equal(result.project.workstreams[0].end,'2026-11-16');assert.equal(readProject(f.head,f.p.id).workstreams[0].summary,next.workstreams[0].summary);
 f.c.session.viewer='member';await assert.rejects(saveProject({connection:f.c,current:f.current,project:result.project,headId:result.headId}),/仅频道创建者/);assert.equal(f.calls,1);
});

test('a stale management draft cannot overwrite a refreshed channel even with the latest HEAD id',async()=>{
 const f=fixture(),draft=structuredClone(f.p),latest={...f.p,revision:1,summary:'another update'};
 f.head={id:'head-new',content:replaceProject('# original',latest)};
 draft.workstreams[0].summary='stale draft';
 await assert.rejects(saveProject({connection:f.c,current:f.current,project:draft,headId:'head-new'}),/项目版本已变化/);
 assert.equal(f.calls,0);assert.equal(readProject(f.head,f.p.id).summary,'another update');
});

test('roles group only explicit management assignments, keep unassigned visible and never mix roots',()=>{
 const roots=demoProjects();assert.equal(roots.filter(p=>p.company==='OPCB').length,5);
 for(const root of roots){const groups=groupWorkstreams(root.workstreams);assert.equal(groups.length,3);assert.ok(groups.every(g=>g.items.length>=2&&g.items.length<=3));assert.deepEqual(groups.flatMap(g=>g.items).map(w=>w.id).sort(),root.workstreams.map(w=>w.id).sort());}
 const items=[{id:'a',owner:' 同事 '},{id:'b',owner:'同事'},{id:'c',owner:''},{id:'d'}];
 assert.deepEqual(groupWorkstreams(items).map(g=>[g.name,g.items.map(w=>w.id)]),[['同事',['a','b']],['负责人待分配',['c','d']]]);
 assert.equal(groupWorkstreams().length,0);
 assert.notEqual(groupWorkstreams(roots[0].workstreams)[0].items[0].id,groupWorkstreams(roots[1].workstreams)[0].items[0].id);
});


test('management conversation binding is optional, bounded and round trips with the same protected project save',async()=>{
 const f=fixture(),next=structuredClone(f.p);next.workstreams[0].channelId='execution-channel';
 const result=await saveProject({connection:f.c,current:f.current,project:next,headId:'head1'});
 assert.equal(readProject(f.head,f.p.id).workstreams[0].channelId,'execution-channel');
 assert.equal(result.project.revision,1);assert.ok(f.head.content.startsWith('# original'));
 for(const channelId of [false,0,{},['invalid'],'x'.repeat(129)])assert.throws(()=>validateProject({...f.p,workstreams:[{...f.p.workstreams[0],channelId}],tasks:[]},f.p.id),/分项任务格式/);
 assert.equal(canRead(f.c,'execution-channel'),false);
});


test('companies group only explicit membership labels, keep unregistered projects and do not infer from titles',()=>{
 const rows=[{id:'a',level:'company',title:'OPCB 平台商业化',company:' 上粮山 '},{id:'b',level:'company',title:'OPCB 平台商业化',company:'OPCB'},{id:'c',level:'company',title:'OPCB 客户体验'},{id:'d',level:'company',company:'   '},{id:'child',level:'task',company:'OPCB'}];
 assert.deepEqual(groupCompanies(rows).map(g=>[g.id,g.name,g.projects.map(p=>p.id)]),[['上粮山','上粮山',['a']],['OPCB','OPCB',['b']],['','公司待登记',['c','d']]]);
 assert.equal(companyName(rows[0]),'上粮山');assert.equal(groupCompanies().length,0);
 assert.deepEqual(groupCompanies(demoProjects()).map(g=>[g.name,g.projects.length]),[['OPCB',5],['上粮山',1],['白酒',1]]);
});

test('company assignment saves with the channel revision and legacy unassigned data stays unassigned',async()=>{
 const f=fixture(),next={...f.p,company:'上粮山'};const result=await saveProject({connection:f.c,current:f.current,project:next,headId:'head1'});
 assert.equal(result.project.company,'上粮山');assert.equal(result.project.revision,1);assert.ok(f.head.content.startsWith('# original'));
 const old={...f.p};delete old.company;const read=readProject({content:replaceProject('',old)},old.id);assert.equal(read.company,undefined);assert.equal(groupCompanies([read])[0].id,'');
 for(const company of [false,1,[],{},'x'.repeat(121)])assert.throws(()=>validateProject({...f.p,company},f.p.id),/所属公司/);
});

test('channel board counts each channel once and ignores nested tasks and workstreams',()=>{
 const p=project(),other={...project(),id:'other',ownerId:'other-owner'};
 assert.deepEqual(channelTasks([p,p,other,{id:'child',level:'task'}]).map(x=>x.id),[p.id,'other']);
 const stats=channelTaskStats([p,p,other],[], '2026-11-16');
 assert.equal(stats.total,2);assert.equal(stats.unknown,2);assert.equal(stats.month,0);assert.equal(stats.week,0);
 assert.equal(stats.weekStart,'2026-11-16');
});
test('channel additions use native creation seconds with Shanghai dates and Monday weeks across month/year boundaries',()=>{
 const dates=['2026-10-31T16:00:00Z','2026-11-15T15:59:59Z','2026-11-15T16:00:00Z','2026-11-17T00:00:00Z'];
 const rows=dates.map((date,i)=>({id:String(i),level:'company',start:'2026-11-16',workstreams:[{}]}));
 const channels=dates.map((date,i)=>({id:String(i),createdAt:Date.parse(date)/1000,updatedAt:Date.parse('2026-11-16')/1000}));
 assert.deepEqual(channelTaskStats(rows,channels,'2026-11-16'),{total:4,month:3,week:1,unknown:0,monthStart:'2026-11-01',weekStart:'2026-11-16'});
 assert.equal(channelTaskStats(rows,channels,'2026-11-15').weekStart,'2026-11-09');
 const cross=channelTaskStats([{id:'a',level:'company'}],[{id:'a',createdAt:Date.parse('2025-12-30T00:00:00Z')/1000}],'2026-01-01');
 assert.equal(cross.weekStart,'2025-12-29');assert.equal(cross.month,0);assert.equal(cross.week,1);
 assert.throws(()=>channelTaskStats([],[],'2026-02-30'),/统计日期/);
});
test('missing or invalid channel creation does not borrow activity, start dates or document revisions',()=>{
 const rows=Array.from({length:5},(_,i)=>({id:String(i),level:'company',start:'2026-11-16'}));
 const channels=[undefined,'2026-11-16',-1,Infinity,NaN].map((createdAt,i)=>({id:String(i),createdAt,updatedAt:1794830400,lastActivityAt:1794830400}));
 assert.equal(channelTaskStats(rows,channels,'2026-11-16').unknown,5);
});
test('board demo uses the original channel-level tasks while keeping child workstreams out of channel rows',()=>{
 const {projects,channels}=demoBoardData(),company=projects.filter(p=>p.company==='OPCB');
 assert.deepEqual(company.map(p=>p.title),['OPCB 平台商业化','品牌项目交付','团队 AI 协同落地','内容产品建设','客户体验与服务']);
 assert.equal(channelTasks(company).length,5);assert.equal(groupProjects(company).length,3);
 assert.ok(company.every(p=>channels.find(c=>c.id===p.id)?.name===p.title));
 assert.equal(company[0].workstreams.length,8);
 const children=new Set(company.flatMap(p=>p.workstreams.map(w=>w.title)));
 assert.ok(!company.some(p=>children.has(p.title)));
 assert.deepEqual(channelTaskStats(company,channels,'2026-11-16'),{total:5,month:4,week:2,unknown:0,monthStart:'2026-11-01',weekStart:'2026-11-16'});
 assert.equal(demoProjects()[0].workstreams.length,8);
});

test('explicit business responsibility groups channel rows without granting account access or changing steward',async()=>{
 const f=fixture(),second={...f.p,id:'other-channel',responsible:'周洋'},third={...f.p,id:'third-channel',responsible:'源昊'};
 const next={...f.p,responsible:'周洋'};
 assert.deepEqual(groupProjects([next,second,third]).map(g=>[g.name,g.projects.length]),[['周洋',2],['源昊',1]]);
 assert.equal(groupProjects([next,third],'周洋')[0].projects[0].id,f.p.id);
 const saved=await saveProject({connection:f.c,current:f.current,project:next,headId:'head1'});
 assert.equal(saved.project.responsible,'周洋');assert.equal(saved.project.ownerId,'owner');
 f.c.session.viewer='member';assert.equal(canWrite(f.c,f.p.id,saved.project),false);
 await assert.rejects(saveProject({connection:f.c,current:f.current,project:{...saved.project,responsible:'member'},headId:saved.headId}),/仅频道创建者/);
 for(const responsible of [false,123,{},[],'x'.repeat(121)])assert.throws(()=>validateProject({...next,responsible},next.id),/负责人/);
});

test('channel age counts inclusive Shanghai calendar days, without task or activity dates',async()=>{
 const {channelAge}=await import('../src/project-workspace/model.mjs');const now=Date.parse('2026-11-16T14:20:00Z');
 const make=seconds=>({createdAt:now/1000-seconds,start:'1999-01-01',updatedAt:now/1000,lastActivityAt:now/1000});
 for(const seconds of [0,30,65,3700])assert.equal(channelAge(make(seconds),now).text,'1 天');
 assert.equal(channelAge(make(90000),now).text,'2 天');
 assert.equal(channelAge(make(172800),now).text,'3 天');
 assert.equal(channelAge({...make(90000),updatedAt:now/1000+100},now).dateTime,new Date(now-90000000).toISOString());
 for(const createdAt of [undefined,null,'1794830000',-1,Infinity,NaN,now/1000+1])assert.deepEqual(channelAge({createdAt,updatedAt:now/1000},now),{known:false,text:'创建时间未知'});
 const age=(createdAt,date)=>channelAge({createdAt:Date.parse(createdAt)/1000},Date.parse(date)).text;
 assert.equal(age('2026-11-16T15:59:59Z','2026-11-16T16:00:00Z'),'2 天');
 assert.equal(age('2024-02-28T16:00:00Z','2024-02-29T16:00:00Z'),'2 天');
 assert.equal(age('2025-12-31T15:00:00Z','2025-12-31T16:00:00Z'),'2 天');
});

test('confirmed channel creation date is validated, survives saving and agrees with age and statistics',async()=>{
 const {channelAge}=await import('../src/project-workspace/model.mjs');
 const source='buzz://message?channel=confirmation&id='+'a'.repeat(64),now=Date.parse('2026-11-16T14:20:00Z');
 const f=fixture(),p={...f.p,createdOn:'2026-11-16',createdOnSource:source,start:'1999-01-01'};
 assert.equal(channelAge({},now,p).text,'1 天');assert.equal(channelAge({},now,p).dateTime,'2026-11-16');
 assert.equal(channelAge({createdAt:Date.parse('2026-11-14T16:00:00Z')/1000},now,p).text,'2 天');
 assert.equal(channelAge({createdAt:now/1000+1},now,p).known,false);
 for(const createdOn of ['2026-02-30','2026-11-17'])assert.equal(channelAge({},now,{...p,createdOn}).known,false);
 assert.equal(channelAge({},now,{...p,createdOnSource:''}).known,false);
 assert.equal(channelTaskStats([p],[],'2026-11-16').month,1);assert.equal(channelTaskStats([p],[],'2026-11-16').week,1);
 assert.equal(channelTaskStats([p],[{id:p.id,createdAt:Date.parse('2026-10-01T00:00:00Z')/1000}],'2026-11-16').month,0);
 for(const patch of [{createdOn:'2026-02-30'},{createdOnSource:''},{createdOn:123},{createdOn:null}])assert.throws(()=>validateProject({...p,...patch},p.id),/创建日期/);
 const saved=await saveProject({connection:f.c,current:f.current,project:p,headId:'head1'});
 assert.equal(saved.project.createdOn,p.createdOn);assert.equal(saved.project.createdOnSource,source);
});

test('public nonmembers can discover a name; only participants can read Canvas',()=>{
 const f=fixture();f.c.session.viewer='manager';f.c.session.channels.get=id=>id===f.p.id?f.channel:undefined;
 assert.equal(canRead(f.c,f.p.id),false);f.channel.visibility='public';f.channel.readOnly=true;
 assert.equal(canRead(f.c,f.p.id),true);assert.equal(canReadCanvas(f.c,f.p.id),false);assert.equal(canWrite(f.c,f.p.id,f.p),false);
 f.channel.members.push('manager');f.channel.viewerRole='guest';
 assert.equal(canReadCanvas(f.c,f.p.id),true);assert.equal(canWrite(f.c,f.p.id,f.p),false);
 f.channel.members.pop();
 for(const prop of ['private','metadataCached','metadataPending','cached','archived']){f.channel[prop]=true;assert.equal(canRead(f.c,f.p.id),false,prop);delete f.channel[prop];}
 f.channel.channelType='solo';assert.equal(canRead(f.c,f.p.id),false);
});
test('directory names require signed resolution and never auto-join',async()=>{
 const {discoverBoardChannels}=await import('../src/project-workspace/store.mjs');const f=fixture();f.c.session.viewer='manager';let joins=0,resolves=0;const found=new Map();
 f.c.session.channels={list:()=>({status:'ready',channels:[]}),readDirectory:async()=>({partial:false}),openDirectory:()=>[{id:'public',name:'共享任务'},{id:'private',name:'私密名称不是授权'}],get:id=>found.get(id),resolve:async([id])=>{resolves++;found.set(id,{id,visibility:id==='public'?'public':'private',members:[],channelType:'stream',readOnly:true});}};
 f.c.session.channelLifecycle={available:true,run:async()=>joins++};
 assert.deepEqual(await discoverBoardChannels(f.c),['public']);assert.equal(resolves,2);assert.equal(joins,0);
 assert.deepEqual(await discoverBoardChannels(f.c,{valid:()=>false}),[]);
});
test('join occurs only on an explicit selection, confirms membership and refuses scope changes or private access',async()=>{
 const {joinBoardChannel}=await import('../src/project-workspace/store.mjs');const f=fixture();f.c.session.viewer='manager';f.channel.visibility='public';f.channel.readOnly=true;let calls=0;
 f.c.session.channelLifecycle={available:true,run:async(action,id,signal,valid)=>{assert.equal(action,'join');assert.equal(id,f.p.id);assert.equal(valid(),true);calls++;f.channel.members.push('manager');delete f.channel.readOnly;}};
 await joinBoardChannel({connection:f.c,current:f.current,id:f.p.id});assert.equal(calls,1);assert.equal(canReadCanvas(f.c,f.p.id),true);
 await joinBoardChannel({connection:f.c,current:f.current,id:f.p.id});assert.equal(calls,1);
 f.channel.members=f.channel.members.filter(x=>x!=='manager');f.channel.visibility='private';await assert.rejects(joinBoardChannel({connection:f.c,current:f.current,id:f.p.id}),/权限/);
 f.channel.visibility='public';await assert.rejects(joinBoardChannel({connection:f.c,current:()=>({...f.c,generation:2}),id:f.p.id}),/权限/);
});

test('short progress accepts 40 Unicode characters, rejects overflow and lines before saving',async()=>{
 const f=fixture();
 for(const summary of ['进'.repeat(40),'🙂'.repeat(40)]){
  const g=fixture();await saveProject({connection:g.c,current:g.current,project:{...g.p,summary},headId:'head1'});assert.equal(g.calls,1);
 }
 for(const summary of ['进'.repeat(41),'🙂'.repeat(41),'已交接\n待验收','已交接\u2028待验收']){
  await assert.rejects(saveProject({connection:f.c,current:f.current,project:{...f.p,summary},headId:'head1'}),/限40字/);assert.equal(f.calls,0);
 }
 const next=structuredClone(f.p);next.workstreams[0].summary='进'.repeat(41);
 await assert.rejects(saveProject({connection:f.c,current:f.current,project:next,headId:'head1'}),/限40字/);assert.equal(f.calls,0);
});
test('long legacy progress remains readable and unchanged edits preserve it without truncation',async()=>{
 const f=fixture(),long='历史进度'.repeat(30);f.p.summary=long;f.p.workstreams[0].summary=long;f.head={id:'head1',content:replaceProject('# preserve legacy',f.p)};
 assert.equal(readProject(f.head,f.p.id).summary,long);
 const saved=await saveProject({connection:f.c,current:f.current,project:{...f.p,title:'调整标题'},headId:'head1'});
 assert.equal(saved.project.summary,long);assert.equal(saved.project.workstreams[0].summary,long);
 const g=fixture();g.head=undefined;g.c.session.viewer='creator';const p=newProject(g.channel,'creator','创建者');p.summary='进'.repeat(41);
 await assert.rejects(saveProject({connection:g.c,current:g.current,project:p,headId:null}),/限40字/);assert.equal(g.calls,0);
});
