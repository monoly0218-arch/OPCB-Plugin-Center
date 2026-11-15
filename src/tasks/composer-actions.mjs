// Native composer extension: edits the user's draft through the public host API only.
export function taskInstruction(task,action){
 const text=action==='find'?'这个任务已经交付了，请找一下当前轮次的结果链接并核对版本，更新到待验收。':task?'请处理这项任务。执行前读取最新轮次，实际开工和交付时自动更新任务状态。':'请建立一个新任务：';
 return task?`任务：${task.title}\ntask_id: ${task.id}\nrevision: ${task.revision||0}\n${text}`:text;
}
export function createTaskComposerActions(React){
 const h=React.createElement,Context=React.createContext(null);
 const icon=path=>h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:path}));
 function Tool(props){
  const owner=React.useContext(Context),menu=React.useRef(null),popup=React.useRef(null),trigger=React.useRef(null),inserted=React.useRef(new Set());
  const [error,setError]=React.useState('');
  const close=()=>{popup.current?.hidePopover?.();if(menu.current)menu.current.open=false;};
  const toggle=e=>{
   e.preventDefault();if(props.disabled)return;
   if(menu.current?.open){close();return;}
   menu.current.open=true;const panel=popup.current;
   if(typeof panel?.showPopover!=='function'){setError('当前浏览器不支持任务菜单，请在对话中直接输入要求。');menu.current.open=false;return;}
   panel.showPopover();const anchor=trigger.current.getBoundingClientRect(),bounds=panel.getBoundingClientRect();
   panel.style.left=Math.max(8,Math.min(anchor.left,window.innerWidth-bounds.width-8))+'px';
   panel.style.top=Math.max(8,anchor.top-bounds.height-8)+'px';
   panel.querySelector('button:not(:disabled)')?.focus();
  };
  const insert=()=>{
   const draft=owner?.draft;
   if(!draft||!owner.visible||props.disabled||inserted.current.has(draft.key))return;
   if(props.insertText('\n'+taskInstruction(draft.task,draft.action)+'\n')){
    inserted.current.add(draft.key);owner.setDraft(current=>current?.key===draft.key?null:current);setError('');props.focus();
   }else setError('指令未填入，原草稿保留。');
  };
  React.useEffect(insert,[owner?.draft?.key,owner?.visible,props.channelId,props.disabled,props.insertText]);
  React.useEffect(()=>{if(!owner?.visible||props.disabled){close();}},[owner?.visible,props.disabled]);
  React.useEffect(()=>{if(!owner)return;const outside=e=>{if(menu.current&&!menu.current.contains(e.target))close();};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[!!owner]);
  React.useEffect(()=>{const hide=()=>close();window.addEventListener('resize',hide);return()=>window.removeEventListener('resize',hide);},[]);
  if(!owner)return null;
  const choose=action=>{
   close();
   if(action==='solo'){owner.onNewSolo?.(owner.task.id);return;}
   owner.setDraft({key:crypto.randomUUID(),task:action==='new'?null:owner.task,action});
  };
  return h('div',{className:'tr-composer-actions',onKeyDown:e=>{if(e.key==='Escape'&&menu.current?.open){e.preventDefault();e.stopPropagation();close();trigger.current?.focus();}}},
   h('details',{ref:menu},h('summary',{ref:trigger,onClick:toggle,'aria-label':'任务操作','aria-disabled':props.disabled},icon('M5 4h14v16H5z M8 9l1 1 2-2 M13 9h3 M8 15l1 1 2-2 M13 15h3'),'Task',icon('m9 10 3 3 3-3')),
    h('div',{ref:popup,popover:'manual',className:'tr-action-menu',style:{position:'fixed',inset:'auto',margin:0},onToggle:e=>{if(e.newState==='closed'&&menu.current)menu.current.open=false;}},...[
     ['discuss','Run task','开始处理当前任务','M8 5v14l11-7z',!owner.task],
     ['find','Find delivery','查找当前轮次交付','M10 14l4-4 M8 16l-2 2a4 4 0 0 1-6-6l5-5 M16 8l2-2a4 4 0 0 1 6 6l-5 5',!owner.task],
     ['solo',owner.task?.executionSolo?.phase==='ready'?'Open Solo':owner.task?.executionSolo?'Continue Solo':'New Solo','打开或建立当前任务的专属会话','M4 5h16v12H9l-5 4z M9 10h6 M12 7v6',!owner.task||!owner.onNewSolo||owner.soloBusy],
     ['new','New task','新建任务','M12 5v14 M5 12h14',false]
    ].map(([action,label,description,path,unavailable])=>h('button',{type:'button',key:action,'aria-label':label,disabled:props.disabled||unavailable,onClick:()=>choose(action)},icon(path),h('span',null,label,h('small',null,description)))),h('p',null,'填入草稿，确认后发送'))),
   error&&h('span',{role:'alert',className:'tr-insert-error'},error,h('button',{type:'button',disabled:props.disabled,onClick:insert},'重试填入')));
 }
 return {Context,Tool};
}
