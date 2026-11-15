// Interior workspace primitives adapted from the approved Woday/Sphere pages.
// React and all interactions belong to the caller; no browser or business state.
export function createMediaUI(React) {
  const h = React.createElement;
  const paths = {
    menu:'M4 6h16M4 12h16M4 18h16',folder:'M3 7V4h7l3 3h8v14H3Z',clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',person:'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21a8 8 0 0 1 16 0',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',tag:'M3 3h8l10 10-8 8L3 11ZM7 7h.01',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',columns:'M3 3h7v11H3ZM14 3h7v6h-7ZM3 18h7v3H3ZM14 13h7v8h-7Z',
    search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2',
    arrow: 'M7 17 17 7M7 7h10v10',
    left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6',
    play: 'm9 5 11 7-11 7Z', chat: 'M4 4h16v14H9l-5 4ZM8 8h8M8 12h5',
    moon: 'M20 14a8 8 0 0 1-10-10A9 9 0 1 0 20 14',
    grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
    list: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
    filter: 'M4 6h16M7 12h10M10 18h4',
    close: 'm6 6 12 12M6 18 18 6', star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',
    collect: 'M5 5h14v15H5ZM8 2h8M9 9h6M9 13h6',
    studio: 'm14 3 7 7-11 11H3v-7ZM11 6l7 7', publish: 'm3 11 18-8-8 18-2-8ZM11 13l5-5',
    image: 'M3 3h18v18H3ZM3 16l6-6 5 5 3-3 4 4M15 7h.01',
    file: 'M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h5',
    download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  };
  function Icon({name,size=20}) {
    return h('svg',{viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[name]||paths.file}));
  }
  function Tool({label,icon,onClick,pressed,disabled=false,children,...props}) {
    return h('button',{type:'button',className:'mw-tool',onClick,disabled,'aria-label':label,title:label,...(pressed===undefined?{}:{'aria-pressed':pressed}),...props},icon&&h(Icon,{name:icon}),children);
  }
  function Mark({name,size=28}) {
    const assets=typeof OPCB_FACTORY_ASSETS_UI_ASSETS==='object'?OPCB_FACTORY_ASSETS_UI_ASSETS:{};
    return assets[name]?h('img',{src:assets[name],alt:'',width:size,height:size,className:'mw-mark'}):h(Icon,{name:'file',size});
  }
  function Header({brand,mark,tabs=[],active,onTab,query,onQuery,searchLabel='搜索素材',tools}) {
    return h('header',{className:'mw-topbar'},
      h('div',{className:'mw-brand'},h(Mark,{name:mark,size:30}),h('span',null,brand)),
      tabs.length>0&&h('nav',{className:'mw-main-nav','aria-label':'工作区导航'},tabs.map(tab=>h('button',{type:'button',key:tab.id,'aria-current':tab.id===active?'page':undefined,onClick:()=>onTab(tab.id)},h(Icon,{name:tab.icon,size:18}),tab.label))),
      h('div',{className:'mw-top-tools'},onQuery&&h('label',{className:'mw-search'},h(Icon,{name:'search',size:18}),h('input',{type:'search',value:query,placeholder:searchLabel,'aria-label':searchLabel,onChange:e=>onQuery(e.target.value)})),tools));
  }
  function Pager({page,total,size,onPage}) {
    const pages=Math.max(1,Math.ceil(total/size));
    return h('footer',{className:'mw-pagination'},h('span',{className:'mw-numeric'},total?`${page*size+1}—${Math.min((page+1)*size,total)} / ${total}`:'0'),h('div',null,h(Tool,{label:'上一页',icon:'left',disabled:page===0,onClick:()=>onPage(page-1)}),h('span',{className:'mw-numeric'},`${page+1} / ${pages}`),h(Tool,{label:'下一页',icon:'right',disabled:page+1>=pages,onClick:()=>onPage(page+1)})));
  }
  return {Icon,Tool,Mark,Header,Pager};
}
