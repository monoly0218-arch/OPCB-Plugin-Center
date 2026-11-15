// Local help only: opening this card never reads/writes tasks or sends a message.
export function createTaskHelp(React){
 const h=React.createElement;
 const steps=[
  ['新建任务','点 New task，告诉 Agent 要做什么，确认发送。'],
  ['选择与修改','点任务正文；New Solo 建立专属会话，之后 Open Solo 继续。'],
  ['确认完成','自己做完就勾选；Agent 交付后勾选验收，再点可重新打开。'],
  ['查找交付','点 Task → Find delivery，确认发送。'],
  ['移除与撤销','点 Select 选任务后移除，误删点“撤销”。']
 ];
 return function TaskHelp(){
  const [open,setOpen]=React.useState(false),id=React.useId();
  const trigger=React.useRef(null),heading=React.useRef(null);
  const close=()=>{setOpen(false);trigger.current?.focus({preventScroll:true});};
  React.useEffect(()=>{if(open)heading.current?.focus({preventScroll:true});},[open]);
  return h('div',{className:'tr-help',onKeyDown:event=>{
   if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  }},
   h('button',{ref:trigger,type:'button',className:'tr-help-trigger','aria-label':'使用方法','aria-haspopup':'dialog','aria-expanded':open,'aria-controls':id,onClick:()=>open?close():setOpen(true)},
    h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('circle',{cx:12,cy:12,r:9}),h('path',{d:'M9.8 8.8a2.3 2.3 0 1 1 3.5 2c-.9.5-1.3 1-1.3 2.2 M12 16.5v.2'})),
    'Help'),
   open&&h('section',{id,role:'dialog','aria-modal':false,'aria-labelledby':id+'-title',className:'tr-help-card'},
    h('header',null,h('h2',{id:id+'-title',ref:heading,tabIndex:-1},'任务中心怎么用'),h('button',{type:'button','aria-label':'收起使用方法',onClick:close},'×')),
    h('ol',null,...steps.map(([title,body])=>h('li',{key:title},h('strong',null,title+'：'),h('span',null,body)))),
    h('p',{className:'tr-help-note'},'状态由 Agent 更新，最终结果由你确认。')));
 };
}
