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

  function LibraryPicker({kind, entries, selected, onSelect, busy, run, session}) {
    const [name, setName] = R.useState('');
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
      h('div', {className:'fp-field-heading'}, h('strong', null, label),
        h('details', {className:'fp-library-add'}, h('summary', null, '添加' + label),
          h('div', null,
            h('input', {'aria-label':label + '名称', value:name, maxLength:160, placeholder:label + '名称', onChange:e => setName(e.target.value)}),
            h('label', {className:'fp-upload'}, '选择图片', h('input', {type:'file', accept:'image/*', multiple:true,
              'aria-label':'上传到' + label + '库', disabled:busy, onChange:upload})),
            h('button', {type:'button', disabled:busy, onClick:() => run(async () => {
              const entry = await store.recoverLibraryUpload();
              if (entry.kind === kind) onSelect(entry.id, true);
            })}, '恢复上次上传')))),
      entries.length ? h('div', {className:'fp-library-grid'}, ...entries.map(entry =>
        h('label', {key:entry.id, className:'fp-library-item', 'data-selected':selected.includes(entry.id)},
          h('input', {type:'checkbox', 'aria-label':'选择' + label + '：' + entry.name,
            checked:selected.includes(entry.id), disabled:busy, onChange:e => onSelect(entry.id, e.target.checked)}),
          h('img', {src:session.media(entry.files[0].url, 'small'), alt:'', loading:'lazy'}),
          h('span', null, entry.name)))) : h('p', {className:'fp-muted'}, label + '库暂无图片，可添加后勾选'));
  }

  function Inputs({doc, version, library, connection, busy, run, onVersion, executor, setExecutor, agents}) {
    const draftKey = `${connection.scope}:${connection.session.viewer}:${doc.cardId}:${version.id}`;
    const initial = () => {
      const entries = ['person','product'].flatMap(kind => libraryChoices(library?.doc, version, kind));
      const selected = entries.filter(entry => entry.files.every(file => version.materials.some(m => m.kind === entry.kind && m.sha256 === file.sha256))).map(entry => entry.id);
      return {prompt:version.revisedPrompt || version.prompt, selected, revision:doc.revision};
    };
    const [draft, setDraft] = R.useState(() => drafts.get(draftKey) || initial());
    R.useEffect(() => {if (!drafts.has(draftKey)) setDraft(initial());}, [version.prompt,version.revisedPrompt,doc.revision,library?.doc.revision]);
    const edit = patch => {
      const next = {...draft, ...patch}; drafts.set(draftKey,next); setDraft(next);
    };
    const allEntries = ['person','product'].flatMap(kind => libraryChoices(library?.doc, version, kind));
    const retained = version.materials.filter(m => !['person','product'].includes(m.kind));
    const latest = doc.versions.find(v => v.id === doc.currentVersion);
    const inFlight = ['queued','running'].includes(latest.status);
    const select = (id, checked) => edit({selected:checked ? [...new Set([...draft.selected,id])] : draft.selected.filter(value => value !== id)});
    const execute = () => run(async () => {
      await store.execute(doc.cardId, {
        expected_revision:draft.revision, version_id:latest.id, executor,
        prompt:draft.prompt, materials:selectedMaterials(allEntries,draft.selected,retained),
      });
      drafts.delete(draftKey);
    });
    return h('div', {className:'fp-inputs'},
      h('div', {className:'fp-field-heading'}, h('label', {htmlFor:'fp-prompt-' + doc.cardId}, '提示词'),
        h('select', {'aria-label':'提示词版本', value:version.id, disabled:busy, onChange:e => onVersion(e.target.value)},
          ...[...doc.versions].reverse().map(v => h('option', {key:v.id,value:v.id}, `版本 ${v.number}${v.id === doc.currentVersion ? ' · 最新' : ''}`)))),
      h('textarea', {id:'fp-prompt-' + doc.cardId, 'aria-label':'本版提示词', rows:4, value:draft.prompt,
        readOnly:inFlight, maxLength:16000, onChange:e => edit({prompt:e.target.value}), placeholder:'填写本次执行使用的完整提示词'}),
      draft.revision !== doc.revision && drafts.has(draftKey) && h('p', {className:'fp-notice'},
        '资料已有更新，编辑内容已保留。', h('button', {type:'button',disabled:busy,onClick:() => {
          drafts.delete(draftKey); setDraft(initial());
        }}, '读取最新内容')),
      h('div', {className:'fp-libraries'}, ...['person','product'].map(kind => h(LibraryPicker, {
        key:kind, kind, entries:allEntries.filter(entry => entry.kind === kind), selected:draft.selected,
        onSelect:select, busy:busy || inFlight, run, session:connection.session,
      }))),
      retained.length > 0 && h('details', {className:'fp-retained'}, h('summary',null,'参考物料 · ' + retained.length),
        h('ul',null,...retained.map(file => h('li',{key:file.kind + file.sha256},
          h('a',{href:connection.session.media(file.url),download:file.name},file.name))))),
      h('div', {className:'fp-submit'},
        h('select', {'aria-label':'执行Agent',value:executor,disabled:busy || inFlight,onChange:e => setExecutor(e.target.value)},
          h('option',{value:''},'选择执行 Agent'),...agents.map(agent => h('option',{key:agent.pubkey,value:agent.pubkey},agent.name || agent.pubkey.slice(0,12)))),
        h('button', {type:'button',className:'fp-primary',disabled:busy || latest.status === 'running' || !inFlight && (!draft.prompt.trim() || !executor),onClick:execute},
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
          h('strong',null,'实际执行提示词'),h('pre',null,version.prompt || '尚未填写'),
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
      !doc ? h('div',{className:'fp-empty'},h('p',null,snapshot.pending ? '正在建立专属Solo…' : '点击左侧条目接续执行Solo')) : h(R.Fragment,null,
        h('details',{className:'fp-controls',open:true},h('summary',null,'制作设置'),
          h(Inputs,{key:current.id,doc,version:current,library:snapshot.library,connection,busy:busy || snapshot.pending,run,onVersion:setSelected,executor,setExecutor,agents}),
          h(History,{doc,record,connection,busy:busy || snapshot.pending,run,onVersion:setSelected,selected:current.id})),
        h(Context.Provider,{value:context},h('div',{className:'fp-conversation'},Workspace ? h(Workspace,{
          id:'opcb.content-factory.production:' + record.channel,session:connection.session,scope:connection.scope,
          target:{channelId:record.channel},label:doc.title + ' · 执行规划',
        }) : h('p',null,'完整原生会话暂不可用，请启用Channels')))));
  };
}
