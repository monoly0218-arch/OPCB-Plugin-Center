import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {IDENTITY_ICONS} from '../src/identity-icons/icons.mjs';
const root=new URL('../',import.meta.url),registry=JSON.parse(await readFile(new URL('REGISTRY.json',root)));
for(const id of Object.keys(IDENTITY_ICONS)){
 const entries=registry.entries.filter(row=>row.id===id&&!row.legacy);
 if(!entries.length)throw Error('No current identity release '+id);
 for(const entry of entries){
  const folder=new URL(entry.sourcePath+'/',root),icon=await readFile(new URL('icon.png',folder));
  if('data:image/png;base64,'+icon.toString('base64')!==IDENTITY_ICONS[id])throw Error('Identity reverted in '+entry.sourcePath);
  const code=await readFile(new URL('plugin.js',folder),'utf8');
  if(!code.includes(IDENTITY_ICONS[id]))throw Error('Runtime identity not embedded '+entry.sourcePath);
  const info=JSON.parse(await readFile(new URL('IDENTITY.json',folder)));
  if(info.sha256!==createHash('sha256').update(icon).digest('hex')||info.id!==id)throw Error('Identity metadata mismatch '+entry.sourcePath);
 }
}
console.log('PASS: every current OPCB release embeds its canonical identity image');
