export function validateNote(note) {
 if(!note||typeof note.id!=='string'||note.id.length>80||typeof note.page!=='string'||note.page.length>120||typeof note.selector!=='string'||note.selector.length>500||typeof note.comment!=='string'||note.comment.length>2000||!note.comment.trim()||!Array.isArray(note.rect)||note.rect.length!==4||note.rect.some(n=>!Number.isFinite(n)||n<0||n>1)||note.rect[2]<=0||note.rect[3]<=0||note.rect[0]+note.rect[2]>1.001||note.rect[1]+note.rect[3]>1.001||typeof note.revision!=='string'||!/^[a-f0-9]{64}$/.test(note.revision)) throw Error('Invalid design annotation');
 return {id:note.id,page:note.page,selector:note.selector,comment:note.comment.trim(),rect:note.rect.map(n=>Math.round(n*10000)/10000),revision:note.revision,label:String(note.label||'Selected area').slice(0,160),source:note.source&&typeof note.source.url==='string'&&/^https:\/\//.test(note.source.url)?{url:note.source.url.slice(0,2048),message:String(note.source.message||'').slice(0,64)}:null};
}
export function formatNotes(notes,source) {
 if(!notes.length||notes.length>50)throw Error('Select between 1 and 50 notes');
 return ['Please apply these design changes. Preserve the remaining flow and the agreed Ayo reference mappings.',`Source: ${source?.url||'Local imported HTML'}`,`Source message: ${source?.message||'local'}`,'Coordinates are fractions of the selected phone screen or reference image (x, y, width, height). Each note includes its original document SHA-256; check the current page before applying it.','',...notes.map((raw,i)=>{const n=validateNote(raw);return `${i+1}. Page: ${n.page}\n   Element: ${n.selector}\n   Area: [${n.rect.join(', ')}]\n   Label: ${n.label}\n   Source: ${n.source?.url||source?.url||'local HTML'}\n   Source message: ${n.source?.message||source?.message||'local'}\n   Document: ${n.revision}\n   Change: ${n.comment}`;})].join('\n');
}
export function appendToComposer(editors,connection,channel,text){
 const matches=[...editors.values()].filter(e=>e.scope===connection.scope&&e.session.viewer===connection.session.viewer&&e.channelId===channel&&!e.threadRootId&&!e.disabled);
 if(matches.length!==1||matches[0].insertText('\n'+text+'\n')!==true)throw Error('Open the bound execution chat to add this note to its draft');
 return true;
}
export async function submitNotes(session,channel,prompt,check){
 check();if(typeof session.messages?.send!=='function')throw Error('Message sending is unavailable');
 const id=await session.messages.send(channel,prompt);check();
 if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('Submission was not confirmed. Check the chat before trying again.');
 return id;
}
