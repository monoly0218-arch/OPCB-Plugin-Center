import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const [template,tokens,components,preview,script]=await Promise.all(['preview.template.html','tokens.css','components.css','preview.css','preview.js'].map(p=>readFile(new URL(p,base),'utf8')));
if(script.includes('</script')) throw new Error('Preview source contains script terminator');
const html=template.replace('/*__STYLES__*/',[tokens,components,preview].join('\n')).replace('/*__SCRIPT__*/',script);
await writeFile(new URL('PREVIEW.html',base),html);
console.log('Built standalone PREVIEW.html');
