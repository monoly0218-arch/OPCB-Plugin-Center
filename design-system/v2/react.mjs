/** Host-injected primitives. Styles: tokens.css + components.css. No dependencies. */
export const VERSION='2.0.0-candidate.1';
const join=(...v)=>v.filter(Boolean).join(' ');
export function createUI(React){
 if(typeof React?.createElement!=='function')throw new TypeError('Pass host React');
 const h=React.createElement;
 function Tool({label,children,className,...props}){if(!label?.trim())throw new TypeError('Tool requires label');return h('button',{type:'button',...props,className:join('v2-tool',className),'aria-label':label},children);}
 function Chip({tone='',children,...props}){return h('span',{...props,className:'v2-chip','data-tone':tone},children);}
 function Header({title,subtitle,tools}){return h('header',{className:'v2-header'},h('div',null,h('h1',{className:'v2-heading',tabIndex:-1},title),subtitle?h('p',{className:'v2-subtitle'},subtitle):null),tools?h('div',{className:'v2-tools'},tools):null);}
 function Item({title,meta,identity,selected=false,done=false,onToggle,onOpen,priority='',toggleLabel,children}){return h('article',{className:'v2-task','data-selected':String(selected)},identity?h('span',{className:'v2-identity','aria-hidden':true},identity):onToggle?h('button',{className:'v2-check',type:'button','aria-label':toggleLabel||`完成：${title}`,'aria-pressed':done,'data-priority':priority,onClick:onToggle}):null,h(onOpen?'button':'div',{className:'v2-object',...(onOpen?{type:'button',onClick:onOpen,'aria-current':selected?'true':undefined}:{})},h('span',{className:'v2-object-title'},title),meta?h('span',{className:'v2-meta'},meta):null),children);}
 function Group({title,count,children}){return h('section',{className:'v2-group'},h('header',null,h('h2',null,title),count!=null?h('p',{className:'v2-group-count'},count):null),h('div',null,children));}
 function Board({children,label='日期看板'}){return h('div',{className:'v2-board','aria-label':label},children);}
 function Column({title,date,today=false,children}){return h('section',{className:'v2-column','data-today':String(today)},h('h2',null,h('span',null,title),h('small',null,date)),children);}
 function Dual({collections,current}){return h('div',{className:'v2-dual'},h('section',{className:'v2-collections'},collections),h('section',{className:'v2-current',tabIndex:-1},current));}
 function Workspace({global,nav,children,detail,theme='host',language='zh',layout='work',navOpen=false,dualOpen=false,className,...props}){return h('div',{...props,lang:language,className:join('opcb-v2',className),'data-theme':theme,'data-layout':layout,'data-language':language,'data-nav':navOpen?'open':'closed','data-detail':detail?'open':'closed','data-dual-detail':dualOpen?'open':'closed'},h('div',{className:'v2-shell'},h('div',{className:'v2-global'},global),h('nav',{className:'v2-nav','aria-label':'插件导航'},nav),h('div',{className:'v2-content'},layout==='dual'?children:h('main',{className:'v2-panel v2-main'},children),detail?h('aside',{className:'v2-panel v2-detail',tabIndex:-1,'aria-label':'当前内容'},detail):null)));}
 return{Tool,Chip,Header,Item,Group,Board,Column,Dual,Workspace};
}
