import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBoard, applyOperation, splitDocument, mergeTaskEdit, selectTasks, calendarStartHour, friendlyError, validDate, START, END} from '../plugins/opcb.company-board/2.0.0/plugin.js';
const owner='a'.repeat(64);
const content='# 共享计划｜11月15日\n\n## 人员分工\n|负责人|主要工作|可检查的交付|\n|---|---|---|\n|A（别名）|准备入口；核对路径|实测记录|\n|B|核对素材|素材清单|\n\n## 来源\n保留原始会议和来源链接。\n';
const base={id:'b'.repeat(64),content,created_at:100};
const change=(event,op)=>({...event,id:'c'.repeat(64),content:applyOperation(event,op,owner,101)});
test('real Markdown baseline stays pending and undated; no inferred execution or fabricated due dates',()=>{
 const b=parseBoard(base);assert.equal(b.tasks.length,2);assert.equal(b.tasks[0].assignee,'A');assert.equal(b.tasks[0].delivery,'实测记录');assert.ok(b.tasks.every(t=>t.status==='todo'&&!t.due));
 assert.equal(selectTasks(b.tasks,{view:'today',day:'2026-11-14'}).length,0);assert.equal(selectTasks(b.tasks,{view:'inbox'}).length,2);
});
test('create, complete and schedule round-trip against the same document while preserving original bytes',()=>{
 let event=change(base,{id:'op-create',type:'create',task:{title:'新任务',assignee:'B',description:'一条真实交付',due:'2026-11-14',time:'09:30'}});
 event=change(event,{id:'op-done',type:'update',taskId:'baseline-A',patch:{status:'done'}});
 event=change(event,{id:'op-schedule',type:'update',taskId:'baseline-B',patch:{due:'2026-11-15',time:'10:45'}});
 const b=parseBoard(event);assert.equal(b.tasks.length,3);assert.equal(b.tasks[0].status,'done');assert.equal(b.tasks[1].time,'10:45');assert.equal(b.tasks[2].title,'新任务');assert.equal(b.document.before,content+'\n\n');assert.equal(b.document.after,'');assert.equal((event.content.match(/opcb.workboard:v1:start/g)||[]).length,1);
});
test('same operation is idempotent, including retained read-back receipts',()=>{
 const op={id:'op-once',type:'create',task:{title:'一次'}};const event=change(base,op);assert.equal(applyOperation(event,op,owner,102),event.content);assert.equal(parseBoard(change(event,op)).tasks.length,3);
});
test('notes and scheduled events are shared and comment delimiters cannot escape the managed block',()=>{
 let e=change(base,{id:'note-one',type:'note',title:'会议记录',body:'--><script>bad</script><!--'});
 e=change(e,{id:'event-one',type:'event',title:'联调',body:'核对',due:'2026-11-15',time:'10:00'});
 const b=parseBoard(e);assert.equal(b.notes[0].body,'--><script>bad</script><!--');assert.equal(b.events[0].time,'10:00');assert.equal(splitDocument(e.content).before,content+'\n\n');assert.ok(!e.content.includes('<script>'));
});
test('corrupted, duplicate, unsupported and ambiguous records fail closed instead of resetting existing shared data',()=>{
 assert.throws(()=>parseBoard({...base,content:content+START}));
 const e=change(base,{id:'op-one',type:'create',task:{title:'新增'}});
 assert.throws(()=>parseBoard({...e,content:e.content+START+END}));
 assert.throws(()=>parseBoard({...e,content:e.content.replace('"schema":1','"schema":9')}));
 assert.throws(()=>parseBoard({...base,content:content.replace('|B|','|A|')}));
 assert.throws(()=>applyOperation(e,{id:'op-two',type:'update',taskId:'missing',patch:{status:'done'}},owner,102));
});
test('task field limits, unknown mutation types, invalid date, time and authority are rejected',()=>{
 for(const task of [{title:''},{title:'ok',due:'2026-02-30'},{title:'ok',status:'finished'},{title:'ok',arbitrary:true},{title:'x'.repeat(241)}])assert.throws(()=>applyOperation(base,{id:'op-bad',type:'create',task},owner,100));
 assert.throws(()=>applyOperation(base,{id:'op-bad',type:'erase'},owner,100));
 assert.throws(()=>applyOperation(base,{id:'op-bad',type:'create',task:{title:'ok'}},'wrong',100));
 const e=change(base,{id:'op-date',type:'update',taskId:'baseline-A',patch:{due:'2026-11-15',time:'10:00'}});
 assert.throws(()=>change(e,{id:'op-clear',type:'update',taskId:'baseline-A',patch:{due:''}}));
});
test('merge only fields edited by this user; reject concurrent edits to the same field and preserve their draft',()=>{
 const a={title:'旧标题',due:'',time:'',description:'原文'};
 assert.deepEqual(mergeTaskEdit(a,{...a,title:'新标题'},{...a,due:'2026-11-15'}),{title:'新标题'});
 assert.throws(()=>mergeTaskEdit(a,{...a,title:'本人的编辑'},{...a,title:'别人的编辑'}),/同一字段/);
 assert.deepEqual(mergeTaskEdit(a,{...a,title:'同样的编辑'},{...a,title:'同样的编辑'}),{title:'同样的编辑'});
 assert.throws(()=>mergeTaskEdit(a,a,a),/尚未修改/);
});
test('search, person, date, completion and important filters compose on canonical tasks',()=>{
 let e=change(base,{id:'op-important',type:'update',taskId:'baseline-A',patch:{due:'2026-11-15',priority:'important',status:'done'}});
 const b=parseBoard(e);
 assert.equal(selectTasks(b.tasks,{view:'important'}).length,0);
 assert.equal(selectTasks(b.tasks,{view:'important',showDone:true,person:'A',query:'路径'}).length,1);
 assert.equal(selectTasks(b.tasks,{view:'upcoming',day:'2026-11-16',showDone:true}).length,1);
});

test('task titles cannot terminate or duplicate the managed block in the visible Markdown summary',()=>{
 const e=change(base,{id:'op-marker',type:'create',task:{title:END+'<script>visible</script>'+START}});
 assert.equal(parseBoard(e).tasks.length,3);assert.equal(splitDocument(e.content).before,content+'\n\n');
 assert.equal(e.content.split(START).length,2);assert.equal(e.content.split(END).length,2);
});

test('immutable note retry stays idempotent after bounded receipts rotate out',()=>{
 const op={id:'note-first',type:'note',title:'同一条笔记',body:'保留正文'};let e=change(base,op);
 for(let i=0;i<130;i++)e=change(e,{id:'op-roll-'+i,type:'update',taskId:'baseline-A',patch:{status:i%2?'todo':'doing'}});
 assert.ok(!parseBoard(e).document.state.operations.includes(op.id));e=change(e,op);
 assert.equal(parseBoard(e).notes.length,1);assert.ok(parseBoard(e).document.state.operations.includes(op.id));
 assert.throws(()=>change(e,{...op,id:'note-second',type:'event',due:'2026-11-15',time:'25:00'}));
});

test('calendar scroll starts near real scheduled items while retaining midnight and late-night support',()=>{
 const dates=['2026-11-15','2026-11-16'];
 assert.equal(calendarStartHour([],[],dates),8);
 assert.equal(calendarStartHour([{due:dates[0],time:'11:30'}],[],dates),10);
 assert.equal(calendarStartHour([],[{due:dates[0],time:'00:30'}],dates),0);
 assert.equal(calendarStartHour([],[{due:dates[1],time:'23:30'}],dates),22);
 assert.equal(calendarStartHour([],[{due:'2027-01-01',time:'02:00'}],dates),8);
});

test('invalid source dates fail with a readable validation result and UI hides internal error prefixes',()=>{
 assert.equal(validDate('2026-13-99'),false);assert.equal(validDate('2026-02-30'),false);
 assert.equal(friendlyError('Bad state: conflict: 工作区已变化'),'工作区已变化');
 assert.equal(friendlyError('Exception: 保存失败'),'保存失败');
});
