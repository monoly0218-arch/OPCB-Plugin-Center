import {currentPrompt,promptLabel} from './prompt-modules.mjs';
import {STATUS, versionDifferences} from './production-model.mjs';
import {productionAccess} from './production-store.mjs';
import {exportProduction} from './production-export.mjs';
import {libraryChoices, selectedMaterials} from './material-library.mjs';

export function createProductionPanel(ctx, store, onChannel) {
  const R = ctx.react, h = R.createElement, Context = R.createContext(null), drafts = new Map();
  ctx.effect(() => () => drafts.clear());
  function ProductionContext(props) {
    const data = R.useContext(Context);
    return data ? h('button', {type:'button', disabled:props.disabled, onClick:() => {
      if (props.insertText('\n' + data + '\n')) props.focus();
    }}, '制作版本') : null;
  }
  ctx.conversation.registerTool({id:'factory-production-context', title:'制作版本', component:ProductionContext});

  function LibraryPicker({kind, entries, selected, onSelect, busy, run, session, revision}) {
    const [name, setName] = R.useState(''), [editing, setEditing] = R.useState(null);
    const label = kind === 'person' ? '角色' : '产品';
    const upload = async event => {
      const files = [...event.target.files]; event.target.value = '';
      if (!files.length) return;
      run(async () => {
        const entry = await store.addLibraryFiles(kind, name, files);
        setName(''); onSelect(entry.id, true);
      });
    };
    return h('section', {className:'fp-library', 'aria-label':label + '库'},
      h('div', {className:'fp-field-heading'}, h('div', {className:'fp-library-title'}, h('strong', null, label),
        h('span',null,selected.filter(id => entries.some(entry => entry.id === id)).length + ' 已选')),
        h('details', {className:'fp-library-add'}, h('summary', null, '＋ 添加' + label),
          h('div', null,
            h('input', {'aria-label':label + '名称', value:name, maxLength:160, placeholder:label + '名称', onChange:e => setName(e.target.value)}),
            h('label', {className:'fp-upload'}, '选择图片', h('input', {type:'file', accept:'image/*', multiple:true,
              'aria-label':'上传到' + label + '库', disabled:busy, onChange:upload})),
            h('button', {type:'button', disabled:busy, onClick:() => run(async () => {
              const entry = await store.recoverLibraryUpload();
              if (entry.kind === kind) onSelect(entry.id, true);
            })}, '恢复上次上传')))),
      entries.length ? h('div', {className:'fp-library-grid'}, ...entries.map(entry =>
        h('article', {key:entry.id, className:'fp-library-item', 'data-kind':kind, 'data-selected':selected.includes(entry.id)},
          h('label', {className:'fp-library-choice'},
            h('input', {type:'checkbox', 'aria-label':'选择' + label + '：' + entry.name,
              checked:selected.includes(entry.id), disabled:busy, onChange:e => onSelect(entry.id, e.target.checked)}),
            h('span', {className:'fp-library-image'}, h('img', {src:session.media(entry.files[0].url, 'small'), alt:entry.name, loading:'lazy'})),
            h('span', {className:'fp-library-name',title:entry.name}, entry.name)),
          h('div', {className:'fp-library-meta'},h('span',null,entry.files.length + ' 张原图'),
            !entry.id.startsWith('retained:') && h('button', {type:'button',className:'fp-rename',disabled:busy,
              'aria-label':'重命名' + label + '：' + entry.name,
              onClick:() => setEditing({id:entry.id,name:entry.name,revision})}, '改名')))))
        : h('p', {className:'fp-muted'}, label + '库暂无图片，可添加后勾选'),
      editing && h('form', {className:'fp-rename-form',onSubmit:event => {
        event.preventDefault();run(async () => {await store.renameLibrary(editing.id,editing.name,editing.revision);setEditing(null);});
      }},h('label',null,'修改' + label + '名称',h('input',{'aria-label':'新' + label + '名称',autoFocus:true,value:editing.name,maxLength:160,
        onChange:e => setEditing({...editing,name:e.target.value})})),
        h('div',null,h('button',{type:'button',disabled:busy,onClick:() => setEditing(null)},'取消'),
          h('button',{type:'submit',className:'fp-primary',disabled:busy || !editing.name.trim()},'保存名称'))));
  }

  function PromptEditor({kind, doc, busy, run, onClose}) {
    const group=doc.prompts[kind], latest=currentPrompt(doc,kind);
    const [editing,setEditing]=R.useState({id:latest.id,text:latest.text,revision:doc.revision});
    const dialog=R.useRef(null),inFlight=doc.versions.some(v=>['queued','running'].includes(v.status));
    R.useEffect(()=>{const node=dialog.current;node.showModal();return()=>node.close();},[]);
    return h('dialog',{ref:dialog,className:'fp-prompt-dialog','aria-label':promptLabel(kind),onCancel:event=>{event.preventDefault();onClose();}},
      h('form',{onSubmit:event=>{event.preventDefault();run(async()=>{
        await store.mutate(doc.cardId,'save_prompt',{expected_revision:editing.revision,version_id:doc.currentVersion,prompt_kind:kind,prompt_version:editing.id,prompt:editing.text});onClose();
      });}},h('header',null,h('h2',null,promptLabel(kind)),h('button',{type:'button',onClick:onClose,'aria-label':'关闭'+promptLabel(kind)},'关闭')),
      h('select',{'aria-label':promptLabel(kind)+'版本',value:editing.id,disabled:busy,onChange:event=>{
        const value=group.versions.find(v=>v.id===event.target.value);setEditing({id:value.id,text:value.text,revision:editing.revision});
      }},...[...group.versions].reverse().map(v=>h('option',{key:v.id,value:v.id},'版本 '+v.number+(v.id===group.current?' · 当前':'')))),
      h('textarea',{'aria-label':promptLabel(kind)+'内容',autoFocus:true,value:editing.text,readOnly:inFlight,maxLength:16000,onChange:event=>setEditing({...editing,text:event.target.value}),
        placeholder:kind==='template'?'执行时根据工作流、参考视频、角色和产品图反推模板1.0提示词':''}),
      editing.revision!==doc.revision&&h('p',{role:'status'},'资料已有更新，当前输入已保留；复制内容后重新打开可读取最新版本'),
      inFlight&&h('p',null,'本轮执行输入已封存，完成后可保存新版本'),
      h('footer',null,h('button',{type:'button',onClick:onClose},'取消'),h('button',{type:'submit',className:'fp-primary',disabled:busy||inFlight||editing.revision!==doc.revision||kind==='workflow'&&!editing.text.trim()},'保存并使用'))));
  }

  function Inputs({card, doc, version, library, connection, busy, run, onVersion, executor, setExecutor, agents}) {
    const [libraryKind,setLibraryKind] = R.useState('person'),[promptKind,setPromptKind]=R.useState('');
    const draftKey = `${connection.scope}:${connection.session.viewer}:${doc.cardId}:${version.id}`;
    const initial = () => {
      const entries = ['person','product'].flatMap(kind => libraryChoices(library?.doc, version, kind));
      const selected = entries.filter(entry => entry.files.every(file => version.materials.some(m => m.kind === entry.kind && m.sha256 === file.sha256))).map(entry => entry.id);
      return {selected};
    };
    const [draft, setDraft] = R.useState(() => drafts.get(draftKey) || initial());
    R.useEffect(() => {if (!drafts.has(draftKey)) setDraft(initial());}, [version.prompt,version.revisedPrompt,doc.revision,library?.doc.revision]);
    const edit = patch => {
      const next = {...draft, ...patch}; drafts.set(draftKey,next); setDraft(next);
    };
    const allEntries = ['person','product'].flatMap(kind => libraryChoices(library?.doc, version, kind));
    const retained = [...version.materials.filter(m => !['person','product'].includes(m.kind)&&!(m.kind==='reference'&&m.type.startsWith('video/'))),...(doc.referenceVideo?[{...doc.referenceVideo,kind:'reference'}]:[])];
    const workflow=currentPrompt(doc,'workflow'),template=currentPrompt(doc,'template');
    const latest = doc.versions.find(v => v.id === doc.currentVersion);
    const inFlight = ['queued','running'].includes(latest.status);
    const select = (id, checked) => edit({selected:checked ? [...new Set([...draft.selected,id])] : draft.selected.filter(value => value !== id)});
    const execute = () => run(async () => {
      await store.execute(doc.cardId, {
        expected_revision:doc.revision, version_id:latest.id, executor,
        prompt:template.text, workflowPrompt:workflow.text, materials:selectedMaterials(allEntries,draft.selected,retained),
      });
      drafts.delete(draftKey);
    });
    return h('div', {className:'fp-inputs'},
      h('div',{className:'fp-prompt-modules','aria-label':'提示词模块'},...['workflow','template'].map(kind=>{
        const prompt=currentPrompt(doc,kind);
        return h('button',{key:kind,type:'button',disabled:busy,className:'fp-prompt-module',onClick:()=>setPromptKind(kind)},
          h('strong',null,promptLabel(kind)),h('span',null,kind==='template'&&!prompt.text?'待反推 · 版本 '+prompt.number:'版本 '+prompt.number),h('small',null,'查看 / 修改'));
      })),
      promptKind&&h(PromptEditor,{key:promptKind,kind:promptKind,doc,busy,run,onClose:()=>setPromptKind('')}),
      h('section',{className:'fp-reference','aria-label':'参考视频'},h('div',{className:'fp-field-heading'},h('strong',null,'参考视频'),
        h('button',{type:'button',disabled:busy||inFlight,onClick:()=>run(()=>store.syncReference(card))},doc.referenceVideo?'重新同步':'同步模板视频')),
        doc.referenceVideo?h(R.Fragment,null,h('video',{src:connection.session.media(doc.referenceVideo.url),controls:true,preload:'metadata'}),
          h('span',{className:'fp-muted'},doc.referenceVideo.name)):h('p',{className:'fp-muted'},'点击模板时自动同步到本条 Solo；同步未完成可重试或上传原文件'),
        h('label',{className:'fp-upload'},doc.referenceVideo?'替换参考视频':'上传参考视频',h('input',{type:'file',accept:'video/*','aria-label':'上传参考视频',disabled:busy||inFlight,onChange:event=>{
          const file=event.target.files?.[0];event.target.value='';if(file)run(()=>store.syncReference(card,file));
        }}))),
      h('div', {className:'fp-material-tabs',role:'tablist','aria-label':'制作物料'},...['person','product'].map(kind =>
        h('button',{key:kind,type:'button',role:'tab',id:'fp-tab-' + doc.cardId + kind,
          'aria-selected':libraryKind === kind,'aria-controls':'fp-library-' + doc.cardId + kind,
          onClick:() => setLibraryKind(kind),onKeyDown:event => {
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
            event.preventDefault();const next=event.key==='Home'?'person':event.key==='End'?'product':libraryKind==='person'?'product':'person';
            setLibraryKind(next);[...event.currentTarget.parentElement.children].find(tab => tab.id === 'fp-tab-' + doc.cardId + next)?.focus();
          },tabIndex:libraryKind === kind?0:-1},kind === 'person'?'角色':'产品',
          h('span',null,draft.selected.filter(id => allEntries.some(entry => entry.id === id && entry.kind === kind)).length)))),
      h('div', {className:'fp-libraries'}, ...['person','product'].map(kind => h('div',{
        key:kind,role:'tabpanel',id:'fp-library-' + doc.cardId + kind,'aria-labelledby':'fp-tab-' + doc.cardId + kind,hidden:libraryKind!==kind,
      },h(LibraryPicker, {
        key:kind, kind, entries:allEntries.filter(entry => entry.kind === kind), selected:draft.selected,
        onSelect:select, busy:busy || inFlight, run, session:connection.session, revision:library?.doc.revision,
      })))),
      retained.some(m=>!m.type.startsWith('video/')) && h('details', {className:'fp-retained'}, h('summary',null,'其他参考物料 · ' + retained.filter(m=>!m.type.startsWith('video/')).length),
        h('ul',null,...retained.filter(m=>!m.type.startsWith('video/')).map(file => h('li',{key:file.kind + file.sha256},
          h('a',{href:connection.session.media(file.url),download:file.name},file.name))))),
      h('div', {className:'fp-submit'},
        h('select', {'aria-label':'执行Agent',value:executor,disabled:busy || inFlight,onChange:e => setExecutor(e.target.value)},
          h('option',{value:''},'选择执行 Agent'),...agents.map(agent => h('option',{key:agent.pubkey,value:agent.pubkey},agent.name || agent.pubkey.slice(0,12)))),
        h('button', {type:'button',className:'fp-primary',disabled:busy || latest.status === 'running' || !inFlight && (!workflow.text.trim() || !doc.referenceVideo || !executor),onClick:execute},
          busy ? '正在提交…' : latest.status === 'running' ? '正在执行' : latest.status === 'queued' ? '核对发送' : '开始执行')));
  }

  function History({doc, connection, record, busy, run, onVersion, selected}) {
    const [preview, setPreview] = R.useState(''), [failure, setFailure] = R.useState(''), [pack, setPack] = R.useState(null);
    const version = doc.versions.find(v => v.id === preview);
    const media = file => connection.session.media(file.url);
    const mutate = (action, extra = {}) => store.mutate(doc.cardId,action,{expected_revision:doc.revision,version_id:version.id,...extra});
    const download = async () => {
      const controller = new AbortController(), c = connection;
      const check = () => {
        const now = ctx.relay.snapshot(); controller.signal.throwIfAborted();
        if (now.session !== c.session || now.scope !== c.scope || now.generation !== c.generation || !productionAccess(now,record.channel)) throw Error('身份或执行Solo权限已变化，已停止打包');
      };
      const output = await exportProduction({doc,version,session:c.session,channel:record.channel,check,signal:controller.signal});
      check(); setPack({file:output,version:version.id});
    };
    const difference = version && doc.versions.find(v => v.id === selected);
    return h('section',{className:'fp-history','aria-label':'视频历史版本'},
      h('strong',null,'视频历史'),
      h('div',{className:'fp-history-list'},...[...doc.versions].reverse().map(v => h('button',{
        key:v.id,type:'button','data-state':v.status,'aria-pressed':preview === v.id,
        onClick:() => {setPreview(preview === v.id ? '' : v.id);setPack(null);setFailure('');},
      },h('span',null,'版本 ' + v.number),h('span',null,STATUS[v.status].text),h('time',null,new Date(v.createdAt).toLocaleString('zh-CN'))))),
      version && h('div',{className:'fp-history-detail'},
        version.result ? h(R.Fragment,null,
          version.result.type.startsWith('video/') ? h('video',{key:version.result.url,src:media(version.result),controls:true,preload:'metadata'}) : h('img',{src:media(version.result),alt:'版本 ' + version.number + ' 结果'}),
          h('a',{href:media(version.result),download:version.result.name},'下载本版成片')) : h('p',{className:'fp-muted'},'本版暂未交付成片'),
        h('details',{className:'fp-archive'},h('summary',null,'本版输入档案'),
          version.workflowPrompt&&h(R.Fragment,null,h('strong',null,'工作流提示词'),h('pre',null,version.workflowPrompt)),
          h('strong',null,'模板提示词'),h('pre',null,version.prompt || '本轮待反推'),
          version.derivedPrompt&&h(R.Fragment,null,h('strong',null,'反推模板提示词'),h('pre',null,version.derivedPrompt)),
          version.revisedPrompt && h(R.Fragment,null,h('strong',null,'执行后更新'),h('pre',null,version.revisedPrompt)),
          h('ul',null,...version.materials.map(file => h('li',{key:file.kind + file.sha256},
            h('a',{href:media(file),download:file.name},file.name))))),
        !version.result && ['draft','running'].includes(version.status) && !(version.status==='draft'&&version.sealed) &&
          h('label',{className:'fp-upload'},'补传本版成片',h('input',{type:'file',accept:'video/*,image/*','aria-label':'上传本版成片',disabled:busy,onChange:event=>{
            const file=event.target.files?.[0];event.target.value='';
            if(file)run(()=>store.upload(doc.cardId,version.id,'result',file));
          }})),
        version.reason && h('p',{className:'fp-failure'},version.reason),
        h('div',{className:'fp-actions'},h('button',{type:'button',disabled:busy,onClick:() => onVersion(version.id)},'查看本版提示词与物料'),
          version.status === 'review' && h('button',{type:'button',className:'fp-accept',disabled:busy,onClick:() => run(() => mutate('accept'))},`验收通过 ${version.number}.0`),
          version.status === 'accepted' && h('button',{type:'button',disabled:busy,onClick:() => run(download)},'打包提示词工程')),
        difference && difference.id !== version.id && h('p',{className:'fp-muted'},(() => {
          const changes = versionDifferences(version,difference);
          return `与上方版本相比，提示词${changes.promptChanged ? '已变更' : '一致'}，新增物料 ${changes.added.length}，减少 ${changes.removed.length}`;
        })()),
        ['draft','running','review'].includes(version.status) && !(version.status === 'draft' && version.sealed) && h('details',null,
          h('summary',null,'记录生成问题'),h('textarea',{'aria-label':'生成失败原因',rows:2,value:failure,maxLength:3000,onChange:e => setFailure(e.target.value)}),
          h('button',{type:'button',disabled:busy || !failure.trim(),onClick:() => run(() => mutate('human_fail',{reason:failure}))},'标记生成失败')),
        pack?.version === version.id && h('a',{className:'fp-package',href:media(pack.file),download:pack.file.name},'下载完整工程包')));
  }

  return function ProductionPanel({connection,card,onBack}) {
    const snapshot = R.useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot);
    const record = snapshot.records[card.id], doc = record?.doc;
    const [selected,setSelected] = R.useState(''), [notice,setNotice] = R.useState(''), [busy,setBusy] = R.useState(false), [executor,setExecutor] = R.useState('');
    const lock = R.useRef(false);
    const choices = connection.session.agentChoices;
    const emptyChoices = R.useMemo(() => ({selectable:[]}),[]);
    const agents = R.useSyncExternalStore(choices?.subscribe || (() => () => {}),choices?.snapshot || (() => emptyChoices),choices?.snapshot || (() => emptyChoices)).selectable || [];
    const current = doc?.versions.find(v => v.id === selected) || doc?.versions.find(v => v.id === doc.currentVersion);
    R.useEffect(() => {choices?.ensure(true,true);},[choices]);
    R.useEffect(() => {onChannel(record?.channel || '');return () => onChannel('');},[record?.channel]);
    R.useEffect(() => {setSelected(doc?.currentVersion || '');},[doc?.currentVersion]);
    R.useEffect(() => {
      const route = connection.session.channels.list().channels.find(c => c.id === record?.channel);
      const member = route?.members?.find(id => agents.some(a => a.pubkey === id));
      if (member) setExecutor(member);
    },[record?.channel,agents]);
    const run = async fn => {
      if (lock.current || snapshot.pending) return;
      lock.current = true; setBusy(true); setNotice('');
      try {await fn();} catch(error) {setNotice(error.message || '操作尚未完成');}
      finally {lock.current = false;setBusy(false);}
    };
    const Workspace = ctx.conversation.ui?.Workspace;
    const context = doc && current ? `内容工厂：${doc.title}\nproduction_version: ${current.id}\nrevision: ${doc.revision}\n先读取opcb_factory_execution；按本人指令执行，完成后回写成片及更新提示词。` : '';
    return h('aside',{className:'fp-plan','aria-label':'素材执行规划'},
      h('header',{className:'fp-heading'},h('div',null,
        onBack && h('button',{type:'button','aria-label':'返回制作列表',onClick:onBack},'返回列表'),h('h2',null,card.title)),
        h('button',{type:'button',disabled:busy || snapshot.pending,onClick:() => run(() => store.refresh())},'刷新状态')),
      (notice || snapshot.error) && h('p',{role:'alert',className:'fp-notice'},notice || snapshot.error),
      snapshot.unfiled?.filter(item => item.cardId === card.id).map(item => h('div',{key:item.file.url,className:'fp-notice'},'待归档：' + item.file.name,
        h('button',{type:'button',disabled:busy || snapshot.pending,onClick:() => run(() => store.recoverUpload(item))},'重新归档此文件'))),
      !doc ? h('div',{className:'fp-empty'},h('p',null,snapshot.pending ? '正在建立专属Solo…' : '点击左侧条目接续执行Solo')) : h('div',{className:'fp-workarea'},
        h('details',{className:'fp-controls',open:true},h('summary',null,'制作设置'),
          h(Inputs,{key:current.id,card,doc,version:current,library:snapshot.library,connection,busy:busy || snapshot.pending,run,onVersion:setSelected,executor,setExecutor,agents}),
          h(History,{doc,record,connection,busy:busy || snapshot.pending,run,onVersion:setSelected,selected:current.id})),
        h(Context.Provider,{value:context},h('div',{className:'fp-conversation'},Workspace ? h(Workspace,{
          id:'opcb.content-factory.production:' + record.channel,session:connection.session,scope:connection.scope,
          target:{channelId:record.channel},label:doc.title + ' · 执行规划',
        }) : h('p',null,'完整原生会话暂不可用，请启用Channels')))));
  };
}
