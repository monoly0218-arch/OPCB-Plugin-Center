import {palette,quiet,icon,displayDate} from './presentation.mjs';

const themes={
  recordings:{paper:'#dce7e3',ink:'#28473e',accent:'#345b4e',label:'工作与协作',description:'会议纪要、工作计划与团队讨论，保留每次决策的来路。'},
  research:{paper:'#e4e1ed',ink:'#514266',accent:'#74618d',label:'产品与研究',description:'产品快照与研究资料，为新的判断补足背景。'},
  business:{paper:'#ede1d2',ink:'#64452f',accent:'#91623e',label:'经营与业务',description:'经营报表与数据明细，沿用原始口径和时间范围。'},
  content:{paper:'#e7e6d6',ink:'#4e5638',accent:'#707a4d',label:'内容与创作',description:'素材、评论、审核与成品关系，让内容工作有据可查。'},
  haowangshui:{paper:'#e0e6ee',ink:'#384d65',accent:'#5b7895',label:'项目与档案',description:'历史项目的文档与备份，按来源范围查阅。'},
};
export const collectionTheme=source=>themes[source]||themes.recordings;
export function collectionCover(h,{source,title,compact=false,narrow=false}) {
  const theme=collectionTheme(source);
  return h('div',{'aria-hidden':true,style:{position:'relative',width:'100%',flexShrink:0,height:compact?112:undefined,aspectRatio:compact?undefined:'0.82',background:theme.paper,color:theme.ink,borderRadius:'6px 14px 14px 6px',boxShadow:'inset 8px 0 12px #00000008, 0 8px 18px #0000000a',overflow:'hidden',textAlign:'left'}},
    h('div',{style:{position:'absolute',left:12,top:0,bottom:0,width:1,background:theme.ink,opacity:.16}}),
    h('div',{style:{padding:compact?'18px 24px':'24px 24px',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between'}},
      h('span',{style:{fontSize:11,opacity:.75}},theme.label),
      h('span',{style:{fontSize:compact||narrow?20:26,fontWeight:500,lineHeight:1.4,maxWidth:compact?220:undefined,overflowWrap:'anywhere'}},title),
      !compact?h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',opacity:.65}},icon(h,'book',19),h('span',{style:{fontSize:11}},'知识集合')):null),
    h('div',{style:{position:'absolute',right:20,top:0,width:12,height:34,background:theme.accent,opacity:.6,borderRadius:'0 0 2px 2px'}}));
}
export function sourceStatus(source) {
  if(source.state!=='ready')return '来源待检查';
  const date=source.source_facts?.completed_date;
  return date?`数据截至 ${date}`:source.synced_at?`${displayDate(source.synced_at)} 同步`:'已同步';
}
