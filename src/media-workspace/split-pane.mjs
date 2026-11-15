const DEFAULT=.6;
export const SPLIT_GUTTER=28;
export function splitBounds(width){
 const available=Math.max(1,width-SPLIT_GUTTER),minimum=Math.min(.4,300/available);
 return [minimum,1-minimum];
}
export function clampSplit(value,width){
 const [min,max]=splitBounds(width);
 return Math.max(min,Math.min(max,Number.isFinite(value)?value:DEFAULT));
}
export function createSplitPane(React){
 return function useSplitPane(key,active){
  const row=React.useRef(null),drag=React.useRef(null),ratio=React.useRef(DEFAULT);
  const [value,setValue]=React.useState(DEFAULT),[width,setWidth]=React.useState(1200),[dragging,setDragging]=React.useState(false);
  const update=next=>{ratio.current=next;setValue(next);};
  React.useEffect(()=>{let saved;try{saved=key?JSON.parse(localStorage.getItem(key)):null;}catch{}update(typeof saved==='number'&&saved>0&&saved<1?saved:DEFAULT);},[key]);
  React.useLayoutEffect(()=>{const node=row.current;if(!node)return;const measure=()=>setWidth(node.clientWidth);measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
  React.useEffect(()=>{if(!active||width<=900){drag.current=null;setDragging(false);}},[active,width]);
  const save=()=>{try{if(key)localStorage.setItem(key,JSON.stringify(ratio.current));}catch{}};
  const effective=clampSplit(value,width),[min,max]=splitBounds(width);
  const finish=e=>{if(!drag.current||e.pointerId!==drag.current.id)return;drag.current=null;setDragging(false);save();};
  return {row,style:{'--tr-task-share':String(effective),'--tr-split-gap':`${SPLIT_GUTTER}px`},dragging,separator:{
   role:'separator',tabIndex:0,'aria-label':'调整内容与会话宽度','aria-orientation':'vertical',
   'aria-valuemin':Math.round(min*100),'aria-valuemax':Math.round(max*100),'aria-valuenow':Math.round(effective*100),'aria-valuetext':`内容 ${Math.round(effective*100)}%，会话 ${Math.round((1-effective)*100)}%`,
   title:'拖动调整分屏比例；双击恢复默认',
   onPointerDown:e=>{if(!active||width<=900||e.button!==0)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,before:ratio.current};setDragging(true);},
   onPointerMove:e=>{if(drag.current?.id!==e.pointerId)return;const box=row.current.getBoundingClientRect();update(clampSplit((e.clientX-box.left-SPLIT_GUTTER/2)/(box.width-SPLIT_GUTTER),box.width));},
   onPointerUp:finish,onPointerCancel:finish,onLostPointerCapture:finish,
   onDoubleClick:()=>{update(DEFAULT);save();},
   onKeyDown:e=>{
    if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();update(drag.current.before);drag.current=null;setDragging(false);return;}
    const next={ArrowLeft:effective-.02,ArrowRight:effective+.02,Home:min,End:max,Enter:DEFAULT}[e.key];
    if(next===undefined)return;e.preventDefault();e.stopPropagation();update(clampSplit(next,width));save();
   }
  }};
 };
}
