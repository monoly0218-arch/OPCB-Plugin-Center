import {DEFAULT_WORKFLOW} from './default-workflow.mjs';

export const promptKinds = ['workflow','template'];
export const promptLabel = kind => kind === 'workflow' ? '工作流提示词' : '模板提示词';
const entry = (text, number, now, extra={}) => ({id:crypto.randomUUID(),number,text,createdAt:now,...extra});
export function ensurePrompts(doc, now=Date.now()) {
 if(doc.prompts)return doc.prompts;
 const workflow=entry(DEFAULT_WORKFLOW,1,now),templates=[];
 for(const version of doc.versions)for(const text of [version.prompt,version.revisedPrompt]) {
  if(text?.trim() && templates.at(-1)?.text!==text)templates.push(entry(text,templates.length+1,version.createdAt,{productionVersion:version.id}));
 }
 if(!templates.length)templates.push(entry('',1,now,{placeholder:true}));
 doc.prompts={workflow:{current:workflow.id,versions:[workflow]},template:{current:templates.at(-1).id,versions:templates}};
 return doc.prompts;
}
export function currentPrompt(doc,kind) {
 const prompts=doc.prompts || ensurePrompts(structuredClone(doc));
 return prompts[kind].versions.find(v=>v.id===prompts[kind].current);
}
export function savePrompt(doc,kind,text,sourceId,now,extra={}) {
 const group=ensurePrompts(doc,now)[kind];
 if(!group || typeof text!=='string' || text.length>16000 || kind==='workflow'&&!text.trim())throw Error('提示词内容无效，最多16000字');
 const source=group.versions.find(v=>v.id===sourceId);
 if(!source)throw Error('提示词版本已变化，请刷新');
 if(source.text===text){group.current=source.id;return source;}
 if(source.placeholder&&text.trim()){Object.assign(source,{text,...extra});delete source.placeholder;group.current=source.id;return source;}
 if(group.versions.length>=100)throw Error('提示词历史已达100版，请另建模板保留资料');
 const next=entry(text,group.versions.length+1,now,extra);
 group.versions.push(next);group.current=next.id;return next;
}
