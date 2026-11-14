export const inject = ['react', 'pages', 'relay', 'host'];
export function apply(ctx) {
  const R = ctx.react, h = R.createElement, bridge = createBridge(ctx, WORKER);
  ctx.effect(() => () => bridge.dispose());
  function Page() {
    const state = R.useSyncExternalStore(bridge.subscribe, bridge.snapshot, bridge.snapshot);
    const [code, setCode] = R.useState(''), [selected, select] = R.useState([]);
    R.useEffect(() => select(state.selected), [state.selected]);
    const button = {font: 'inherit', minHeight: 44, borderRadius: 8, padding: '8px 16px', cursor: 'pointer'};
    return h('main', {style:{padding:24, maxWidth:900, margin:'0 auto', color:'var(--text-standard)', fontFamily:'inherit'}},
      h('h1', null, '安卓通知桥'),
      h('p', {role:'status'}, state.status),
      h('p', null, '电脑在线时转发；手机需安装 ntfy 无 Firebase 版并允许后台通知。'),
      state.error && h('p', {role:'alert'}, state.error),
      h('label', null, '安卓配对码', h('textarea', {value:code, onChange:e=>setCode(e.target.value), maxLength:6000, rows:4, autoComplete:'off', spellCheck:false,
        style:{display:'block', width:'100%', boxSizing:'border-box', font:'inherit', marginTop:8}, 'aria-label':'安卓配对码'})),
      h('h2', null, '允许提醒的会话'),
      h('div', {style:{maxHeight:400, overflowY:'auto'}}, state.channels.map(channel => h('label', {key:channel.id, style:{display:'flex', alignItems:'center', minHeight:44, gap:12}},
        h('input', {type:'checkbox', checked:selected.includes(channel.id), disabled:state.busy || (!selected.includes(channel.id) && selected.length>=20),
          onChange:e=>select(e.target.checked?[...selected,channel.id]:selected.filter(id=>id!==channel.id))}), channel.name))),
      h('div', {style:{display:'flex', gap:12, flexWrap:'wrap', marginTop:20}},
        h('button', {style:button, disabled:state.busy || !code.trim() || !selected.length, onClick:async()=>{await bridge.save(code,selected); if(bridge.snapshot().enabled) setCode('');}}, '保存配对并启用'),
        h('button', {style:button, disabled:state.busy, onClick:()=>bridge.clear()}, '停用并移除配对')),
      state.lastAccepted>0 && h('p', null, '最近提交：'+new Date(state.lastAccepted*1000).toLocaleString()),
      h('p', null, '遵循静音和已读规则，仅转发新消息；服务接受发送不代表手机已经收到。'));
  }
  ctx.pages.register({id:'android-notifications', title:'安卓通知桥', primary:true, placement:'dock', layout:'document', component:Page});
}
