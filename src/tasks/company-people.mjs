const aliasNames=name=>[name,...String(name||'').split(/[／/（）()]/).map(s=>s.trim()).filter(Boolean)];
export function companyPeople(names,members,profiles,statuses,now=Date.now()/1000){
 const result={};
 for(const name of names){
  const aliases=aliasNames(name),eligible=members.filter(id=>{const p=profiles?.get(id);return p&&!p.nameIsFallback;});
  const exact=eligible.filter(id=>[profiles.get(id).name,profiles.get(id).username].includes(name));
  // Composite aliases explicitly describe one person. A colliding short alias
  // does not override another unique full alias; distinct unique IDs stay unknown.
  const unique=aliases.slice(1).map(alias=>eligible.filter(id=>[profiles.get(id).name,profiles.get(id).username].includes(alias))).filter(ids=>ids.length===1).flat();
  const matches=exact.length?exact:[...new Set(unique)];
  if(matches.length!==1){result[name]={name,presence:null};continue;}
  const id=matches[0],profile=profiles.get(id),status=statuses?.get(id);
  const valid=status&&status.userId===id&&typeof status.text==='string'&&status.text.trim()&&Number.isFinite(status.updatedAt)&&status.updatedAt<=now+300&&(status.expiresAt===undefined||status.expiresAt>now);
  result[name]={name,displayName:profile.name,pubkey:id,picture:typeof profile.picture==='string'?profile.picture:'',isAgent:!!profile.isAgent,presence:valid?{text:status.text.trim(),updatedAt:status.updatedAt}:null};
 }
 return result;
}
export function personToday(tasks,day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 const work=tasks.filter(t=>t.kind!=='assignment'&&!t.removed&&t.date===day),known=new Set(['todo','doing','blocked','review','done']);
 const done=work.filter(t=>t.status==='done').length;
 return {day,total:work.length,done,percent:!work.length||work.some(t=>!known.has(t.status))?null:Math.round(done/work.length*100)};
}
export function personWork(tasks){
 const work=tasks.filter(t=>t.kind!=='assignment'&&!t.removed),current=tasks.filter(t=>!t.removed&&(t.kind!=='assignment'||!!t.execution)&&(t.status==='doing'||t.status==='blocked'));
 return {total:work.length,done:work.filter(t=>t.status==='done').length,unknown:work.filter(t=>t.status==='planning').length,current,review:work.filter(t=>t.status==='review').length,blocked:work.filter(t=>t.status==='blocked'||t.status==='doing'&&t.blockReason).length};
}
