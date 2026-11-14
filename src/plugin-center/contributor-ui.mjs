import {avatarLayout,creditPeople} from './contributors.mjs';

function safePicture(value){return typeof value==='string'&&(/^https:\/\//.test(value)||/^data:image\/(png|webp|jpeg);base64,/.test(value))?value:undefined;}
export function createContributorUI(React){
 const h=React.createElement;
 function Avatar({person,profiles,assets}){
  const current=person?.pubkey?profiles.get(person.pubkey):null;
  const src=safePicture(current?.picture)||assets[`avatar:${person?.key}`]||safePicture(person?.avatar);
  const [failed,setFailed]=React.useState('');
  const name=(current&&!current.nameIsFallback?current.name:undefined)||person?.name||'创建者待核对';
  return h('span',{className:'pc-avatar','data-unknown':!person||undefined},src&&failed!==src?h('img',{src,alt:'',width:32,height:32,onError:()=>setFailed(src)}):h('span',{'aria-hidden':true},person?[...name][0]:'?'));
 }
 return function ContributorStack({entry,data,profiles,assets,error}){
  const credit=creditPeople(entry,data),people=[credit.creator,...credit.contributors];
  const root=React.useRef(null),trigger=React.useRef(null),heading=React.useRef(null),[width,setWidth]=React.useState(110),[open,setOpen]=React.useState(false),id=React.useId();
  const layout=avatarLayout(width,people.length);
  React.useEffect(()=>{
   if(!root.current||typeof ResizeObserver==='undefined')return;
   const observer=new ResizeObserver(rows=>setWidth(Math.floor(rows[0].contentRect.width)));observer.observe(root.current);return()=>observer.disconnect();
  },[]);
  React.useEffect(()=>{if(open)heading.current?.focus();},[open]);
  const name=person=>{const profile=person?.pubkey?profiles.get(person.pubkey):null;return (profile&&!profile.nameIsFallback?profile.name:undefined)||person?.name;};
  const close=()=>{setOpen(false);requestAnimationFrame(()=>{const target=trigger.current?.isConnected?trigger.current:root.current?.querySelector('button');target?.focus();});};
  const toggle=e=>{trigger.current=e.currentTarget;setOpen(v=>!v);};
  return h('div',{className:'pc-people','data-open':open||undefined,ref:root,onKeyDown:e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();}}},
   h('div',{className:'pc-avatar-stack','aria-label':`${credit.count}位已核对贡献者`},...people.slice(0,layout.visible).map((person,index)=>h('button',{key:person?.key||'unknown',type:'button',className:'pc-avatar-button','data-creator':index===0||undefined,title:person?`${name(person)} · ${index===0?'创建者':'贡献者'}`:'创建者待核对','aria-label':person?`${name(person)} · ${index===0?'创建者':'贡献者'}，查看贡献者`:'创建者待核对，查看贡献者','aria-expanded':open,'aria-controls':id,onClick:toggle},h(Avatar,{person,profiles,assets}))),layout.hidden?h('button',{type:'button',className:'pc-avatar-more','aria-label':`查看其余${layout.hidden}位贡献者`,'aria-expanded':open,'aria-controls':id,onClick:toggle},`+${layout.hidden}`):null),
   open?h('section',{id,className:'pc-people-list','aria-label':'全部贡献者'},h('div',{className:'pc-people-heading'},h('h3',{ref:heading,tabIndex:-1},'贡献者'),h('button',{type:'button',onClick:close},'收起')),
    error?h('p',null,'贡献记录暂未刷新，显示已核对署名'):null,
    ...people.map((person,index)=>h('div',{className:'pc-person',key:person?.key||'unknown'},h(Avatar,{person,profiles,assets}),h('div',null,h('strong',null,name(person)||'待核对'),h('span',null,index===0?'创建者':'贡献者')),person?.github?h('a',{href:`https://github.com/${encodeURIComponent(person.github)}`,target:'_blank',rel:'noopener noreferrer','aria-label':`查看${name(person)}的GitHub`},'主页'):null)),
    ...credit.evidence.filter(url=>typeof url==='string'&&/^(https:\/\/github\.com\/|buzz:\/\/message\?)/.test(url)).map((url,index)=>h('a',{className:'pc-pr-link',key:url,href:url,target:'_blank',rel:'noopener noreferrer'},`创建来源 ${index+1}`)),
    ...data.pulls.filter(p=>p.plugins?.includes(entry.id)).map(p=>h('a',{className:'pc-pr-link',key:p.number,href:`https://github.com/monoly0218-arch/OPCB-Plugin-Center/pull/${p.number}`,target:'_blank',rel:'noopener noreferrer'},`PR #${p.number} · ${p.state==='open'?'待合并':'已关闭或合入'}`)),
    ...(data.commits||[]).filter(p=>p.plugins?.includes(entry.id)).map(p=>h('a',{className:'pc-pr-link',key:p.commit,href:`https://github.com/monoly0218-arch/OPCB-Plugin-Center/commit/${p.commit}`,target:'_blank',rel:'noopener noreferrer'},`提交 ${p.commit.slice(0,7)}`)))
   :null);
 };
}
