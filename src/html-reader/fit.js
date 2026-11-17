// Runs inside the opaque-origin document. Only dimensions cross to its parent.
(() => {
 const token=document.querySelector('meta[name="opcb-reader-id"]')?.content;
 let last='',scheduled=false,measuredWidth=0;
 const number=value=>{const n=Number.parseFloat(value);return Number.isFinite(n)&&n>0?n:null;};
 const explicit=document.querySelector('meta[name="opcb-preview"]')?.content||'';
 const viewport=document.querySelector('meta[name="viewport"]')?.content||'';
 const widthHint=number(explicit.match(/width\s*[=:]\s*(\d+)/i)?.[1])||number(viewport.match(/width\s*=\s*(\d+)/i)?.[1]);
 const heightHint=number(explicit.match(/height\s*[=:]\s*(\d+)/i)?.[1]);
 const send=()=>{
  scheduled=false;if(!document.body)return;
  const body=document.body,style=getComputedStyle(body),children=[...body.children].filter(e=>!['SCRIPT','STYLE','LINK','META'].includes(e.tagName)&&getComputedStyle(e).display!=='none');
  let width=widthHint||(/width\s*=\s*device-width/i.test(viewport)?390:1280),height=heightHint||800;
  if(!widthHint&&children.length===1){const child=children[0],s=getComputedStyle(child),rect=child.getBoundingClientRect(),max=number(s.maxWidth);if(rect.width>0&&rect.width<=600&&(max&&max<=600||rect.width<innerWidth*.8)){width=Math.ceil(rect.width+number(style.marginLeft)+number(style.marginRight));if(rect.height>0)height=Math.ceil(rect.height+number(style.marginTop)+number(style.marginBottom));}}
  width=Math.max(width,measuredWidth);
  // First set a document viewport. Then measure its complete scroll canvas,
  // including absolute children. The shell never cover-crops that canvas.
  if(Math.abs(innerWidth-width)>2){parent.postMessage({opcbReader:1,type:'viewport',id:token,width,height},'*');return;}
  const root=document.documentElement;
  const w=Math.ceil(Math.max(width,body.scrollWidth,root.scrollWidth));
  const h=Math.ceil(Math.max(heightHint||0,body.scrollHeight,root.scrollHeight,body.getBoundingClientRect().bottom+scrollY));
  measuredWidth=Math.max(measuredWidth,w);
  const data={opcbReader:1,type:'size',id:token,width:w,height:h,viewportHeight:heightHint||800,background:style.backgroundColor==='rgba(0, 0, 0, 0)'?getComputedStyle(root).backgroundColor:style.backgroundColor};const signature=JSON.stringify(data);
  if(signature!==last){last=signature;parent.postMessage(data,'*');}
 };
 const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(send);}};
 // Save only root scroll coordinates; retaining the same frame also preserves
 // internal scroll containers, form input and document interaction state.
 addEventListener('scroll',()=>parent.postMessage({opcbReader:1,type:'scroll',id:token,x:scrollX,y:scrollY},'*'),{passive:true});
 addEventListener('message',event=>{const m=event.data;if(event.source!==parent||m?.opcbReader!==1||m.type!=='restore'||m.id!==token||!Number.isFinite(m.x)||!Number.isFinite(m.y))return;requestAnimationFrame(()=>{scrollTo({left:Math.max(0,Math.min(m.x,200000)),top:Math.max(0,Math.min(m.y,200000)),behavior:'instant'});parent.postMessage({opcbReader:1,type:'restored',id:token,x:scrollX,y:scrollY},'*');});});
 addEventListener('load',schedule);addEventListener('resize',schedule);
 if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(document.documentElement);
 if(typeof MutationObserver==='function')new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true});
 document.fonts?.ready.then(schedule);schedule();
})();
