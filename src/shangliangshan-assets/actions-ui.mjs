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
  return {ShareDialog,FolderDialog};
}
