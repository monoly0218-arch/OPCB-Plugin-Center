import {movedSchedule,keyboardSchedule} from './interaction-model.mjs';
export function createCalendarDrag(React){return function useCalendarDrag(onReschedule){
 const pending=React.useRef(null),ignored=React.useRef(0),[active,setActive]=React.useState(''),[target,setTarget]=React.useState(null),[message,setMessage]=React.useState(''),[saving,setSaving]=React.useState(false),busy=React.useRef(false),mounted=React.useRef(true);
 const cancel=()=>{const p=pending.current;if(p){clearTimeout(p.timer);try{if(p.node.hasPointerCapture?.(p.id))p.node.releasePointerCapture(p.id);}catch{}}pending.current=null;setActive('');setTarget(null);};
 React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(pending.current?.timer);};},[]);
 const commit=async(task,schedule)=>{if(busy.current||!onReschedule)return;busy.current=true;setSaving(true);setMessage('正在保存排期…');try{await onReschedule(task,schedule);if(mounted.current)setMessage(`已调整到 ${schedule.date} ${schedule.times.join('／')}`);}catch(e){if(mounted.current)setMessage(e.message||'排期未保存，请刷新核对');}finally{busy.current=false;if(mounted.current)setSaving(false);}};
 const row=task=>!onReschedule?{}:{'data-dragging':active===task.id,onPointerDown:e=>{
  if(busy.current||e.button!==0||e.target.closest('[role=checkbox]'))return;
  if(e.pointerType==='touch'&&!e.target.closest('.tr-drag-handle'))return;
  const p={id:e.pointerId,task,node:e.currentTarget,x:e.clientX,y:e.clientY,ready:false};
  p.timer=setTimeout(()=>{if(pending.current!==p)return;p.ready=true;try{p.node.setPointerCapture(p.id);}catch{}setActive(task.id);setMessage('拖到新的日期与时间；Esc 取消');},450);pending.current=p;
 },onPointerMove:e=>{
  const p=pending.current;if(!p||p.id!==e.pointerId)return;
  if(!p.ready){if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>8)cancel();return;}
  e.preventDefault();const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-slot-date]');
  const next=cell?{date:cell.dataset.slotDate,time:cell.dataset.slotTime||task.time||task.times?.[0]||'09:00'}:null;
  p.target=next;setTarget(next);
  const scroll=p.node.closest('.tr-time-scroll');if(scroll){const box=scroll.getBoundingClientRect();if(e.clientY>box.bottom-32)scroll.scrollTop+=18;else if(e.clientY<box.top+60)scroll.scrollTop-=18;if(e.clientX>box.right-32)scroll.scrollLeft+=18;else if(e.clientX<box.left+32)scroll.scrollLeft-=18;}
 },onPointerUp:e=>{const p=pending.current;if(!p||p.id!==e.pointerId)return;const next=p.target;const ready=p.ready;cancel();if(ready){ignored.current=Date.now()+500;e.preventDefault();if(next)void commit(p.task,movedSchedule(p.task,next.date,next.time));}},onPointerCancel:cancel};
 return {row,active,target,message,saving,ignoreClick:e=>{if(Date.now()<ignored.current){e.preventDefault();e.stopPropagation();}},onKeyDown:e=>{if(e.key==='Escape'&&pending.current){e.preventDefault();e.stopPropagation();cancel();setMessage('已取消移动');}},handle:task=>({type:'button',className:'tr-drag-handle','aria-label':'移动任务：'+task.title,title:'长按拖动改期；Shift＋方向键调整。多时段任务一同改期',disabled:!onReschedule||saving,onClick:e=>{e.preventDefault();e.stopPropagation();},onKeyDown:e=>{if(e.shiftKey){const next=keyboardSchedule(task,e.key);if(next){e.preventDefault();e.stopPropagation();void commit(task,next);}}}})};
};}
