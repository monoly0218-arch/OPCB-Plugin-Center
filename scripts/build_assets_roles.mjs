import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const base=new URL('plugins/opcb.shangliangshan-assets/2.0.0-rc.4/plugin.js',root);
const target=new URL('plugins/opcb.shangliangshan-assets/2.0.0-rc.5/plugin.js',root);
const original=await readFile(base,'utf8');
if(createHash('sha256').update(original).digest('hex')!=='d62d9007cb35508bc04dd6a60d74328fdf25c71062c2740496eb4055d82fb170')throw Error('Changed rc.4 business baseline; inspect before rebuilding');
const start='// src/media-workspace/role-binding.mjs\n';
const end='// src/shangliangshan-assets/model.mjs\n';
const before=original.indexOf(start),after=original.indexOf(end,before);
if(before<0||after<0||original.indexOf(start,before+1)!==-1)throw Error('Expected one original role-binding module');
const source=await readFile(new URL('src/media-workspace/role-binding.mjs',root),'utf8');
const output=original.slice(0,before)+start+source.replace(/\bexport (?=(?:const|function)\b)/g,'')+'\n'+original.slice(after);
if(process.argv.includes('--check')){
 if(await readFile(target,'utf8')!==output)throw Error('Stale assets role bundle');
}else await writeFile(target,output);
console.log('Assets rc.5 role module matches source; remaining rc.4 bytes preserved.');
