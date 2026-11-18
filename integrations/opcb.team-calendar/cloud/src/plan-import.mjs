export function parsePlan(input,state,week){
  if(input.trim().startsWith('{'))return JSON.parse(input);
  const rows=input.trim().split('\n').filter(x=>x.trim());
  if(!rows.length)throw new Error('请填写需要导入的任务');
  const tasks=rows.map((line,i)=>{
    const [sourceId,title,projectName,memberName,dayText,deliverable='']=line.split('|').map(s=>s.trim());
    if(!sourceId||!title||!projectName||!memberName)throw new Error(`第 ${i+1} 行缺少编号、任务、项目或负责人`);
    const project=state.projects.find(p=>p.name===projectName),member=state.members.find(m=>m.name===memberName);
    if(!project)throw new Error(`第 ${i+1} 行：找不到项目“${projectName}”`);
    if(!member)throw new Error(`第 ${i+1} 行：找不到成员“${memberName}”`);
    return {sourceId,title,projectId:project.id,assigneeId:member.id,deliverable,dates:dayText?dayText.split(/[,，]/).map(s=>s.trim()).filter(Boolean):[]};
  });
  return {sourceKey:'weekly-plan-manual',plan:{sourceId:week,title:'本周工作计划',weekStart:week},tasks};
}
