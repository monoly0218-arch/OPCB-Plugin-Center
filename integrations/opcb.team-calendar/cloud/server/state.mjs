import {createHash} from 'node:crypto';
import {meetingUrl} from '../src/meetings.mjs';

export class CalendarError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status) => { throw new CalendarError(message, status); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const text = (v, label, max = 200) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail(`${label}格式不正确`);
export const id = v => /^[a-zA-Z0-9_.:-]{1,160}$/.test(v || '') ? v : fail('记录 ID 格式不正确');
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0,10) === v ? v : fail('日期格式不正确');
const statuses = ['todo','doing','review','done','blocked'];


export function applyMutation(current,principal,request) {
  if(!principal||!['owner','editor'].includes(principal.role))fail('没有编辑权限',403);
  if(!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0)fail('需要读取当前版本后再保存');
  if(current.revision!==request.expectedRevision)fail('安排已被更新，当前草稿已保留；请载入最新版本后再提交',409);
  const state=structuredClone(current); delete state.role; delete state.revision; delete state.currentUserPubkey; delete state.currentMemberId;
  const byTask=taskId => state.tasks.find(t=>t.id===taskId) || fail('任务不存在',404);
  const validateTask=(input,old={})=>{
    const task={...old,...input};
    task.id=id(task.id); task.title=text(task.title,'任务标题');
    if(!state.projects.some(p=>p.id===task.projectId)) fail('所属项目不存在');
    if(!state.members.some(m=>m.id===task.assigneeId)) fail('负责人不存在');
    if(!statuses.includes(task.status)) fail('任务状态不正确');
    if(task.dueDate) date(task.dueDate);
    if(task.parentId && task.parentId===task.id) fail('任务不能关联自身为父任务');
    task.description=String(task.description || '').slice(0,4000);
    task.deliverable=String(task.deliverable || '').slice(0,2000);
    if(task.sourceUrl && !/^https:\/\/|^buzz:\/\//.test(task.sourceUrl)) fail('来源链接必须是 HTTPS 或 Buzz 地址');
    task.kind=task.kind||'task';
    if(!['task','meeting'].includes(task.kind))fail('安排类型不正确');
    if(task.kind==='meeting') {
      const m=task.meeting;
      if(!m||!['tencent','other','offline'].includes(m.provider))fail('请选择会议方式');
      if(m.url&&!meetingUrl(m.url))fail('会议链接必须是有效的 HTTPS 地址');
      if(!Array.isArray(m.participantIds)||m.participantIds.length>100||m.participantIds.some(id=>!state.members.some(member=>member.id===id)))fail('参会成员不存在');
      if(![0,5,10,15].includes(m.joinBeforeMinutes)||![0,5,10,15,30].includes(m.reminderMinutes))fail('会议提醒时间不正确');
      if(m.provider==='offline'&&!String(m.location||'').trim())fail('请填写线下会议地点');
      task.meeting={provider:m.provider,url:m.provider==='offline'?'':m.url||'',location:String(m.location||'').trim().slice(0,300),participantIds:[...new Set(m.participantIds)],joinBeforeMinutes:m.joinBeforeMinutes,reminderMinutes:m.reminderMinutes};
    } else task.meeting=null;
    return task;
  };
  const validateAllocation=(input)=>{
    const a={id:id(input.id),taskId:id(input.taskId),date:date(input.date)}; byTask(a.taskId);
    if(input.start || input.end) {
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.end || '') || input.start>=input.end) fail('请输入有效的同日开始和结束时间');
      a.start=input.start; a.end=input.end;
    }
    return a;
  };
  if(request.action==='upsert') {
    if(!Array.isArray(request.tasks) || !request.tasks.length || request.tasks.length>100) fail('一次可写入 1–100 个任务');
    const imported=[],seenSources=new Set();
    const sourceKey=text(request.sourceKey || 'manual','来源标识',80);
    const taskIds=new Map();
    for(const input of request.tasks) {
      const sourceId=text(input.sourceId || input.id,'来源任务标识',160);
      if(seenSources.has(sourceId))fail('同一批次的来源任务标识不能重复');
      seenSources.add(sourceId);
      const found=state.tasks.find(t=>t.sourceKey===sourceKey&&t.sourceId===sourceId);
      const taskId=found?.id || ('task-'+hash(sourceKey+':'+sourceId).slice(0,24));
      const task=validateTask({...input,id:taskId,sourceKey,sourceId,status:input.status || found?.status || 'todo'},found);
      delete task.dates;
      if(found) state.tasks[state.tasks.indexOf(found)]=task; else state.tasks.push(task);
      taskIds.set(sourceId,taskId); imported.push(taskId);
      if(input.dates!==undefined) {
        if(!Array.isArray(input.dates)||input.dates.length>90) fail('任务日期列表不正确');
        state.allocations=state.allocations.filter(a=>a.taskId!==taskId);
        for(const item of input.dates) {
          const d=typeof item==='string'?{date:item}:item;
          const aid='slot-'+hash(taskId+':'+d.date+':'+(d.start||'day')).slice(0,24);
          const a=validateAllocation({...d,id:aid,taskId});
          if(!state.allocations.some(s=>s.id===aid)) state.allocations.push(a);
        }
      }
    }
    if(request.plan) {
      const planId='plan-'+hash(sourceKey+':'+text(request.plan.sourceId,'周计划标识')).slice(0,24);
      const plan={id:planId,title:text(request.plan.title,'周计划标题'),weekStart:date(request.plan.weekStart),taskIds:imported};
      state.plans=state.plans.filter(p=>p.id!==planId).concat(plan);
    }
  } else if(request.action==='update') {
    const old=byTask(id(request.taskId));
    const changes=request.changes || {};
    const allowed=Object.fromEntries(Object.entries(changes).filter(([k])=>['title','projectId','assigneeId','dueDate','status','description','deliverable','sourceUrl','kind','meeting'].includes(k)));
    state.tasks[state.tasks.indexOf(old)]=validateTask(allowed,old);
    if(request.allocations!==undefined) {
      if(!Array.isArray(request.allocations)||request.allocations.length>90) fail('日期列表不正确');
      const next=request.allocations.map(a=>validateAllocation({...a,taskId:old.id}));
      if(new Set(next.map(a=>a.id)).size!==next.length || next.some(a=>state.allocations.some(x=>x.id===a.id&&x.taskId!==old.id))) fail('日程 ID 重复');
      state.allocations=state.allocations.filter(a=>a.taskId!==old.id).concat(next);
    }
  } else if(request.action==='configure') {
    if(principal.role!=='owner')fail('只有工作区管理员可修改项目与成员',403);
    if(!Array.isArray(request.members)||!request.members.length||request.members.length>100||!Array.isArray(request.projects)||!request.projects.length||request.projects.length>100)fail('至少保留一个项目和成员，最多各 100 个');
    const nextMembers=request.members.map(m=>{
      const pubkey=String(m.buzzPubkey||'').trim().toLowerCase();
      if(pubkey&&!/^[0-9a-f]{64}$/.test(pubkey))fail('成员的 Buzz 用户公钥格式不正确');
      return {id:id(m.id),name:text(m.name,'成员姓名',40),initial:text(m.name,'成员姓名',40).slice(0,1),role:String(m.role||'团队成员').slice(0,60),...(pubkey?{buzzPubkey:pubkey}:{})};
    });
    const bound=nextMembers.filter(m=>m.buzzPubkey).map(m=>m.buzzPubkey);
    if(new Set(bound).size!==bound.length)fail('一个 Buzz 用户只能关联一位成员');
    const nextProjects=request.projects.map(p=>({id:id(p.id),name:text(p.name,'项目名称',60),color:['blue','purple','amber'].includes(p.color)?p.color:'blue'}));
    if(new Set(nextMembers.map(m=>m.id)).size!==nextMembers.length||new Set(nextProjects.map(p=>p.id)).size!==nextProjects.length)fail('项目或成员 ID 重复');
    if(state.tasks.some(t=>!nextMembers.some(m=>m.id===t.assigneeId)||!nextProjects.some(p=>p.id===t.projectId)||t.meeting?.participantIds.some(id=>!nextMembers.some(m=>m.id===id))))fail('有任务或会议关联的项目或成员不能移除');
    state.members=nextMembers;state.projects=nextProjects;
  } else fail('不支持的操作');
  for(const task of state.tasks.filter(t=>t.kind==='meeting')) {
    const slots=state.allocations.filter(a=>a.taskId===task.id);
    if(!slots.length||slots.some(a=>!a.start||!a.end))fail('会议需要明确的日期、开始和结束时间');
  }
  if(state.tasks.length>5000 || state.allocations.length>20000 || new TextEncoder().encode(JSON.stringify(state)).length>512000) fail('已超出首版日历容量');
  return {state,revision:current.revision+1};
}
