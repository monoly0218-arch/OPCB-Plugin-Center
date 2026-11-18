// Transport is supplied by the source adapter. These controls never manufacture
// public links or treat a failed clipboard write as successful.
export function createAssetActionsUI(React) {
  const h=React.createElement;
  function Dialog({title,onClose,children}) {
    const ref=React.useRef(null);
    React.useEffect(()=>{
      const prior=document.activeElement,dialog=ref.current;
      dialog.showModal();
      return()=>{dialog.close();if(prior?.isConnected)prior.focus();};
    },[]);
    return h('dialog',{ref,className:'mw-asset-action-dialog','aria-label':title,onCancel:e=>{e.preventDefault();onClose();}},
      h('header',null,h('h2',null,title),h('button',{type:'button','aria-label':'关闭',onClick:onClose},'×')),children);
  }
  function ShareDialog({assets,onShare,onClose,onCopied}) {
    const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[link,setLink]=React.useState('');
    const request=React.useRef(false),generation=React.useRef(0);
    React.useEffect(()=>()=>{generation.current++;},[]);
    async function copy(url,version) {
      try {
        await navigator.clipboard.writeText(url);
        if(version===generation.current){onCopied('链接已复制到剪切板');onClose();}
      } catch {
        if(version===generation.current){setLink(url);setError('复制失败，请重试');}
      }
    }
    async function share(validity) {
      if(request.current)return;
      request.current=true;setBusy(true);setError('');
      const version=generation.current;
      try {
        const value=await onShare(assets,validity);
        if(version!==generation.current)return;
        const url=new URL(value?.url);
        if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('分享链接无效');
        await copy(url.href,version);
      } catch(e) {if(version===generation.current)setError(e.message||'分享失败');}
      finally {request.current=false;if(version===generation.current)setBusy(false);}
    }
    return h(Dialog,{title:'分享',onClose:()=>{if(!busy)onClose();}},
      h('div',{className:'mw-share-options'},[['three-days','三天有效'],['permanent','永久有效']].map(([value,label])=>
        h('button',{key:value,type:'button',disabled:busy,onClick:()=>share(value)},label))),
      link&&h('div',{className:'mw-share-retry'},h('input',{'aria-label':'分享链接',readOnly:true,value:link,onFocus:e=>e.target.select()}),
        h('button',{type:'button',disabled:busy,onClick:()=>copy(link,generation.current)},'复制链接')),
      error&&h('p',{role:'alert'},error));
  }
  function FolderDialog({onCreate,onClose,onCreated}) {
    const [name,setName]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const request=React.useRef(false),generation=React.useRef(0);
    React.useEffect(()=>()=>{generation.current++;},[]);
    async function submit(e) {
      e.preventDefault();if(request.current||!name.trim())return;
      request.current=true;setBusy(true);setError('');const version=generation.current;
      try {const folder=await onCreate(name.trim());if(version===generation.current){onCreated?.(folder);onClose();}}
      catch(e) {if(version===generation.current)setError(e.message||'创建失败');}
      finally {request.current=false;if(version===generation.current)setBusy(false);}
    }
    return h(Dialog,{title:'新建文件夹',onClose:()=>{if(!busy)onClose();}},
      h('form',{onSubmit:submit},h('label',null,'文件夹名称',h('input',{autoFocus:true,required:true,maxLength:80,value:name,onChange:e=>setName(e.target.value),disabled:busy})),
        h('footer',null,h('button',{type:'button',disabled:busy,onClick:onClose},'取消'),h('button',{type:'submit',disabled:busy||!name.trim()},'创建')),
        error&&h('p',{role:'alert'},error)));
  }
  function LifecycleDialog({operation,ids,data,onApply,onClose,onDone}) {
    const permanent=['purge','empty'].includes(operation);
    const [snapshot]=React.useState(()=>({operation,items:ids.map(id=>{const a=data.assets.find(a=>a.id===id);return {id,revision:a.revision};}),...(permanent?{confirm:true,libraryRevision:data.revision}:{})}));
    const [busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    async function submit(){if(busy)return;setBusy(true);try{const result=await onApply(operation,ids,snapshot);onDone(result);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
    return h(Dialog,{title:operation==='empty'?'清空回收站':operation==='purge'?'永久删除':operation==='restore'?'恢复素材':'放入回收站',onClose:()=>{if(!busy)onClose();}},
      h('p',null,permanent?`永久删除 ${ids.length} 组素材？`:`${operation==='restore'?'恢复':'放入回收站'} ${ids.length} 组素材？`),permanent&&h('p',null,'永久删除后无法恢复'),error&&h('p',{role:'alert'},error),
      h('footer',null,h('button',{type:'button',disabled:busy,onClick:onClose},'取消'),h('button',{type:'button',disabled:busy,onClick:submit},permanent?`永久删除 ${ids.length} 组`:'确认')));
  }
  function AssignDialog({ids,data,onApply,onClose,onDone}) {
    const [folder,setFolder]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    return h(Dialog,{title:'加入文件夹',onClose:()=>{if(!busy)onClose();}},h('label',null,'文件夹',h('select',{value:folder,onChange:e=>setFolder(e.target.value)},h('option',{value:''},'请选择'),(data.folders||[]).map(f=>h('option',{key:f.id,value:f.id},f.name)))),error&&h('p',{role:'alert'},error),h('footer',null,h('button',{type:'button',disabled:busy,onClick:onClose},'取消'),h('button',{type:'button',disabled:busy||!folder,onClick:async()=>{setBusy(true);try{await onApply(ids,folder);onDone();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}},'加入')));
  }
  return {ShareDialog,FolderDialog,LifecycleDialog,AssignDialog};

}
