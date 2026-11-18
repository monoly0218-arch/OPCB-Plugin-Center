// Layout preferences contain dimensions only; business content stays in its source.
export function attachSplitPanels(root, layout, page, save) {
 const doc=root.ownerDocument, cleanups=[];
 const groups=[['.workspace','workspace',.64,280],['.ui-map-workspace[data-focused=true]','graph',.42,300],['.rv-template-workspace','template',.7,240],['.wb-media-pair','media',.5,160],['.rv-post-workspace','post',.73,240],['.wb-post-layout','copy',.4,180]];
 for(const [selector,name,initial,min] of groups) for(const [index,parent] of [...root.querySelectorAll(selector)].entries()) {
  const children=[...parent.children].filter(n=>!n.matches('style,svg')&&getComputedStyle(n).display!=='none');
  if(children.length!==2)continue;
  const key=page+':'+name+':'+index;
  let ratio=Number.isFinite(layout[key])?Math.max(.15,Math.min(.85,layout[key])):initial,drag;
  const bar=doc.createElement('div');bar.className='rv-divider';bar.tabIndex=0;bar.setAttribute('role','separator');bar.setAttribute('aria-orientation','vertical');bar.setAttribute('aria-label','调整'+({workspace:'左右面板',graph:'图谱和详情',template:'内容和评论',media:'参考和成果',post:'作品和评论',copy:'视频和文案'}[name])+'大小');bar.setAttribute('aria-valuemin','15');bar.setAttribute('aria-valuemax','85');
  parent.insertBefore(bar,children[1]);parent.classList.add('rv-split');
  const draw=()=>{const width=parent.clientWidth;const horizontal=width>=min*2+12;if(horizontal){const limit=Math.min(.5,min/Math.max(1,width-12));ratio=Math.max(limit,Math.min(1-limit,ratio));}parent.dataset.splitMode=horizontal?'columns':'rows';parent.style.setProperty('--split-first',ratio+'fr');parent.style.setProperty('--split-second',(1-ratio)+'fr');bar.setAttribute('aria-valuenow',String(Math.round(ratio*100)));bar.hidden=!horizontal;};
  const commit=()=>{layout[key]=ratio;save();};
  const resize=(value)=>{const width=parent.clientWidth;const limit=Math.min(.5,min/Math.max(1,width-12));ratio=Math.max(limit,Math.min(1-limit,value));draw();};
  const down=e=>{if(e.button!==0)return;drag=true;bar.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();};
  const move=e=>{if(!drag)return;const box=parent.getBoundingClientRect();resize((e.clientX-box.left)/box.width);e.preventDefault();};
  const end=e=>{if(!drag)return;drag=false;if(bar.hasPointerCapture(e.pointerId))bar.releasePointerCapture(e.pointerId);commit();};
  const keydown=e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();e.stopPropagation();resize(e.key==='Home'?initial:ratio+(e.key==='ArrowLeft'?-.04:.04));commit();}};
  const reset=()=>{resize(initial);commit();};
  for(const [type,fn] of [['pointerdown',down],['pointermove',move],['pointerup',end],['pointercancel',end],['keydown',keydown],['dblclick',reset]])bar.addEventListener(type,fn);
  const observer=new ResizeObserver(draw);observer.observe(parent);draw();
  cleanups.push(()=>{observer.disconnect();bar.remove();parent.classList.remove('rv-split');delete parent.dataset.splitMode;parent.style.removeProperty('--split-first');parent.style.removeProperty('--split-second');});
 }
 return()=>cleanups.forEach(fn=>fn());
}
