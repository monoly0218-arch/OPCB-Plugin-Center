const aliasNames=name=>[name,...String(name||'').split(/[／/（）()]/).map(s=>s.trim()).filter(Boolean)];
export function companyPeople(names,members,profiles,statuses,now=Date.now()/1000){
 const result={};
 for(const name of names){
  const aliases=aliasNames(name),matches=members.filter(id=>{const p=profiles?.get(id);return p&&!p.nameIsFallback&&[p.name,p.username].some(value=>value&&aliases.includes(value));});
  if(matches.length!==1){result[name]={name,presence:null};continue;}
  const id=matches[0],profile=profiles.get(id),status=statuses?.get(id);
  const valid=status&&status.userId===id&&typeof status.text==='string'&&status.text.trim()&&Number.isFinite(status.updatedAt)&&status.updatedAt<=now+300&&(status.expiresAt===undefined||status.expiresAt>now);
  result[name]={name,pubkey:id,isAgent:!!profile.isAgent,presence:valid?{text:status.text.trim(),updatedAt:status.updatedAt}:null};
 }
 return result;
}
export function personWork(tasks){
 const work=tasks.filter(t=>t.kind!=='assignment'&&!t.removed),current=work.filter(t=>t.status==='doing'||t.status==='blocked');
 return {total:work.length,done:work.filter(t=>t.status==='done').length,unknown:work.filter(t=>t.status==='planning').length,current,review:work.filter(t=>t.status==='review').length,blocked:work.filter(t=>t.status==='blocked'||t.status==='doing'&&t.blockReason).length};
}
