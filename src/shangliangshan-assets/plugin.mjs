import {createAssetWorkspace} from './native-workspace.mjs';
import {createAssetLibraryUI} from './library-ui.mjs';
import {createAdaptiveVideo} from '../media-workspace/adaptive-video.mjs';
import {registerWorkspaceFonts} from '../media-workspace/fonts.mjs';
import {createExecutionPanel} from '../media-workspace/execution.mjs';
import {createSplitPane} from '../media-workspace/split-pane.mjs';
import {createMediaUI} from '../media-workspace/ui.mjs';
export const inject = ["react", "pages", "browser", "relay", "conversation", "host"];
// Repository source never contains the owner's assets or thumbnails.
export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const {Header,Tool}=createMediaUI(React);
  registerWorkspaceFonts(ctx);
  const useSplitPane=createSplitPane(React);
  const ExecutionPanel=createExecutionPanel(ctx,{pluginId:'opcb.shangliangshan-assets',title:'上粮山资产库'});
  const title = "上粮山资产库";
  const service=createAssetWorkspace(ctx),Library=createAssetLibraryUI(React),AdaptiveVideo=createAdaptiveVideo(React);
  ctx.effect(()=>{
    const update=()=>service.bind(ctx.relay.snapshot());update();
    const unsubscribe=ctx.relay.subscribe(update);
    return()=>{unsubscribe();service.dispose();};
  });
  function NativeImage({src,alt='',...props}) {
    const [url,setUrl]=React.useState(''),[error,setError]=React.useState('');
    React.useEffect(()=>{let active=true;setUrl('');setError('');service.image(src).then(value=>{if(active)setUrl(value);},e=>{if(active)setError(e.message);});return()=>{active=false;};},[src]);
    return url?h('img',{...props,src:url,alt}):h('span',{className:'mw-native-image-placeholder',role:'img','aria-label':error||alt||'正在读取图片',title:error||undefined},error?'预览不可用':'');
  }
  function NativeVideo({src,poster}) {
    const snapshot=React.useSyncExternalStore(service.subscribe,service.snapshot,service.snapshot);
    const [cover,setCover]=React.useState(''),[error,setError]=React.useState('');
    React.useEffect(()=>{let active=true;setCover('');setError('');if(poster)service.image(poster).then(value=>{if(active)setCover(value);},()=>{});return()=>{active=false;};},[poster]);
    const url=service.mediaUrl(src);
    return url&&!error?h(AdaptiveVideo,{src:url,poster:cover,label:'资产视频预览',onError:()=>setError('视频暂未加载，请刷新资产后重试')}):h('div',{className:'mw-media-unavailable',role:'status'},error||'此视频当前不可预览');
  }

  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  };
  const row = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    minWidth: 0,
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const button = (label, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, label);
  function Workspace({connection}) {
    const state=React.useSyncExternalStore(service.subscribe,service.snapshot,service.snapshot);
    const [website,setWebsite]=React.useState(null),[visit,reload]=React.useState(0);
    const [chat,showChat]=React.useState(false),[mobile,setMobile]=React.useState('content'),[asset,setAsset]=React.useState(null);
    const onAssetChange=React.useCallback(value=>setAsset(value),[]),readCopy=React.useCallback((id,platform)=>service.copy(id,platform),[]);
    const split=useSplitPane(`opcb.shangliangshan-assets.split.v1:${connection.scope}:${connection.session.viewer}`,chat);
    React.useEffect(()=>{const detach=service.attach();service.connect().catch(()=>{});return detach;},[]);
    React.useEffect(()=>{if(chat)setMobile('conversation');},[chat]);
    const executionTools=h(Tool,{label:chat?'收起执行会话':'打开执行会话',icon:'chat',pressed:chat,onClick:()=>showChat(!chat)});
    const openWebsite=React.useCallback((options={})=>{const url=new URL('https://staging.paolab.cn/assets/');if(options.asset)url.searchParams.set('asset',options.asset);if(['tags','permissions'].includes(options.page))url.hash=options.page;setWebsite(url.href);},[]);
    const contextText=asset?`上粮山资产：${asset.title}\n资产ID：${asset.id}\n版本：v${asset.versions?.at(-1)?.number||1}\n来源：https://staging.paolab.cn/assets/?asset=${encodeURIComponent(asset.id)}\n请按我的要求处理，不自动修改资产记录。`:'上粮山资产库工作区：https://staging.paolab.cn/assets/';
    const content=website?h('div',{className:'opcb-v3 media-workspace'},h(Header,{brand:'Assets',mark:'briefcase',tools:h(React.Fragment,null,h(Tool,{label:'返回资产库',icon:'left',onClick:()=>{setWebsite(null);if(state.data)service.refresh().catch(()=>{});}}),h(Tool,{label:'重新载入原站',icon:'refresh',onClick:()=>reload(n=>n+1)}),executionTools)}),h('div',{className:'mw-site'},ctx.browser.available?h(ctx.browser.View,{key:visit,url:website,storage:'opcb.shangliangshan-assets',label:'原站资产操作'}):h('a',{href:website,target:'_blank',rel:'noopener noreferrer'},'打开资产原站'))):
      !state.data?h('div',{className:'opcb-v3 media-workspace'},h(Header,{brand:'Assets',mark:'briefcase',tools:executionTools}),h('div',{className:'mw-signin-page'},h('section',{className:'fw-signin'},h('h2',null,state.loading?'正在进入上粮山资产库':'资产库连接'),h('p',null,'使用当前 Buzz 身份与已有资产权限'),state.error&&h('p',{role:'alert'},state.error),!state.loading&&h('button',{type:'button',className:'mw-button mw-primary',onClick:()=>service.connect().catch(()=>{})},'重新连接')))):
      h(Library,{data:state.data,loading:state.loading,pendingTrash:state.pendingTrash,error:state.error,onRefresh:()=>service.refresh().catch(()=>{}),onOpenWebsite:openWebsite,onReadCopy:readCopy,ImageComponent:NativeImage,VideoComponent:NativeVideo,executionTools,onAssetChange,identityBound:true,onCreateFolder:(name,collection)=>service.createFolder(name,collection),onShare:(ids,validity)=>service.share(ids,validity),onAssignFolder:(ids,folder)=>service.assignFolder(ids,folder),onLifecycle:(operation,ids,snapshot)=>service.lifecycle(operation,ids,snapshot)});
    return h('div',{className:'mw-execution-root','data-mobile-pane':mobile,'data-executing':chat?'true':'false'},
      h('style',null,typeof OPCB_FACTORY_ASSETS_UI_CSS==='string'?OPCB_FACTORY_ASSETS_UI_CSS:''),
      chat&&h('nav',{className:'mw-execution-tabs','aria-label':'执行工作区'},h('button',{type:'button','aria-pressed':mobile==='content',onClick:()=>setMobile('content')},'资产'),h('button',{type:'button','aria-pressed':mobile==='conversation',onClick:()=>setMobile('conversation')},'执行会话')),
      h('div',{className:'mw-execution-row',ref:split.row,style:split.style},h('div',{className:'mw-execution-content'},content),
        chat&&h('div',{className:'mw-execution-splitter',...split.separator,'aria-label':'调整资产与执行会话宽度'}),
        chat&&h('section',{className:'mw-execution-capsule','aria-label':'执行会话'},h('header',null,h('strong',null,'执行会话'),h('button',{type:'button','aria-label':'收起执行会话',onClick:()=>showChat(false)},'×')),h(ExecutionPanel,{connection,contextText}))));
  }

  function Page() {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    const visit = React.useMemo(
      () => ({}),
      [connection.session, connection.generation, connection.scope],
    );
    const previous = React.useRef(),
      sequence = React.useRef(0);
    if (previous.current !== visit) {
      previous.current = visit;
      sequence.current++;
    }
    return connection.status === "ready" &&
      !connection.cached &&
      connection.session?.viewer
      ? h(
          Workspace,
          { key: sequence.current, connection },
        )
      : h(
          "p",
          { style: inset, role: "status" },
          "连接当前账号的社区后可打开工作区",
        );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItcGhvdG8iCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTE1IDhoLjAxIiAvPgogIDxwYXRoIGQ9Ik0zIDZhMyAzIDAgMCAxIDMgLTNoMTJhMyAzIDAgMCAxIDMgM3YxMmEzIDMgMCAwIDEgLTMgM2gtMTJhMyAzIDAgMCAxIC0zIC0zdi0xMiIgLz4KICA8cGF0aCBkPSJNMyAxNmw1IC01Yy45MjggLS44OTMgMi4wNzIgLS44OTMgMyAwbDUgNSIgLz4KICA8cGF0aCBkPSJNMTQgMTRsMSAtMWMuOTI4IC0uODkzIDIuMDcyIC0uODkzIDMgMGwzIDMiIC8+Cjwvc3ZnPg==",
    id: "assets",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page,
  });
}
