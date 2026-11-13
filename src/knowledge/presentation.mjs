// Shared presentation only. Identity, permissions and stored records stay in the client.
export const palette = {
  text:'var(--text-standard, #25282b)', muted:'var(--text-subtle, #6b7077)',
  surface:'var(--surface-panel, #fff)', inset:'var(--surface-inset, #f4f5f6)',
  border:'1px solid var(--border-standard, #dfe2e6)',
};
export const quiet = {fontSize:14,lineHeight:1.6,color:palette.muted};
export const button = {minHeight:40,border:palette.border,borderRadius:8,padding:'8px 14px',font:'inherit',fontSize:14,lineHeight:1.5,color:palette.text,background:palette.surface,cursor:'pointer',whiteSpace:'nowrap'};
export const input = {...button,width:'100%',minWidth:0,boxSizing:'border-box',cursor:'text'};
export const shortKey = key => `${key.slice(0,8)}…${key.slice(-6)}`;
export function documentPreview(value) {
  return String(value||'').replace(/\r\n?/g,'\n').split('\n')
    .filter(line=>line.trim()&&!/^\s*\|/.test(line)&&!/^\s*(?:#{1,6}\s|\[图片\]\s*$|[-*]?\s*\*?\*?(?:录音时间|时长|参与人数|内容类型)\*?\*?\s*[：:])/.test(line))
    .join(' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`#]/g,'')
    .replace(/^\s*[-+]\s+/,'').replace(/\s+/g,' ').trim().slice(0,180);
}
export function displayDate(value, full=false) {
  if(!value)return '时间未提供';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'时间未提供':date.toLocaleDateString('zh-CN',full?{year:'numeric',month:'long',day:'numeric'}:{month:'short',day:'numeric'});
}
export function icon(h,kind,size=18) {
  const paths={search:['m21 21-4.4-4.4','M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15'],
    book:['M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z','M13 7a3 3 0 0 1 3-3h5v14h-4a4 4 0 0 0-4 3'],
    document:['M14 3H5v18h14V8z','M14 3v5h5','M8 12h8','M8 16h6'],
    arrow:['m14 6-6 6 6 6'],people:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8','M20 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75'],
    check:['m5 12 4 4L19 6']};
  return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,style:{flexShrink:0}},...(paths[kind]||paths.document).map((d,i)=>h('path',{key:i,d})));
}
