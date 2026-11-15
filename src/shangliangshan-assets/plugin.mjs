import {registerWorkspaceFonts} from '../media-workspace/fonts.mjs';
import {createExecutionPanel} from '../media-workspace/execution.mjs';
import {createSplitPane} from '../media-workspace/split-pane.mjs';
import {createMediaUI} from '../media-workspace/ui.mjs';
export const inject = ["react", "pages", "browser", "relay", "conversation"];
// Repository source never contains the owner's assets or thumbnails.
export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const {Header,Tool}=createMediaUI(React);
  registerWorkspaceFonts(ctx);
  const useSplitPane=createSplitPane(React);
  const ExecutionPanel=createExecutionPanel(ctx,{pluginId:'opcb.shangliangshan-assets',title:'上粮山资产库'});
  const title = "上粮山资产库";

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
    const [visit,reload]=React.useState(0),[chat,showChat]=React.useState(false),[theme,setTheme]=React.useState('host'),[mobile,setMobile]=React.useState('content');
    const split=useSplitPane(`opcb.shangliangshan-assets.split.v1:${connection.scope}:${connection.session.viewer}`,chat);
    React.useEffect(()=>{if(chat)setMobile('conversation');},[chat]);
    const site=ctx.browser.available?h(ctx.browser.View,{key:visit,url:'https://staging.paolab.cn/assets/',storage:'opcb.shangliangshan-assets',label:'上粮山资产库 · 实时工作区'}):h('section',{className:'mw-empty',role:'status'},h('h2',null,'此设备暂不支持内嵌资产库'),h('a',{href:'https://staging.paolab.cn/assets/',target:'_blank',rel:'noopener noreferrer'},'打开资产库原站'));
    return h('div',{className:'mw-execution-root','data-mobile-pane':mobile,'data-executing':chat?'true':'false'},
      h('style',null,typeof OPCB_FACTORY_ASSETS_UI_CSS==='string'?OPCB_FACTORY_ASSETS_UI_CSS:''),
      chat&&h('nav',{className:'mw-execution-tabs','aria-label':'执行工作区'},h('button',{type:'button','aria-pressed':mobile==='content',onClick:()=>setMobile('content')},'资产'),h('button',{type:'button','aria-pressed':mobile==='conversation',onClick:()=>setMobile('conversation')},'执行会话')),
      h('div',{className:'mw-execution-row',ref:split.row,style:split.style},
        h('div',{className:'opcb-v3 media-workspace mw-execution-content','aria-label':title,'data-language':'zh','data-theme':theme},
          h(Header,{brand:'Assets',mark:'briefcase',tools:h(React.Fragment,null,h(Tool,{label:'重新载入',icon:'refresh',disabled:!ctx.browser.available,onClick:()=>reload(v=>v+1)}),h(Tool,{label:chat?'收起执行会话':'打开执行会话',icon:'chat',pressed:chat,onClick:()=>showChat(!chat)}),h(Tool,{label:'切换明暗主题',icon:'moon',onClick:()=>setTheme(theme==='dark'?'light':'dark')}))}),
          h('div',{className:'mw-site'},site)),
        chat&&h('div',{className:'mw-execution-splitter',...split.separator,'aria-label':'调整资产与执行会话宽度'}),
        chat&&h('section',{className:'mw-execution-capsule','aria-label':'执行会话'},
          h('header',null,h('strong',null,'执行会话'),h('button',{type:'button','aria-label':'收起执行会话',onClick:()=>showChat(false)},'×')),
          h(ExecutionPanel,{connection,contextText:'上粮山资产库工作区：https://staging.paolab.cn/assets/\n网页选择不会自动传给执行会话，请提供具体资产链接或文件。'}))));
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
