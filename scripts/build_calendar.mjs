import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const folder='plugins/opcb.calendar/0.1.0-rc.1';
const icon=await readFile(folder+'/icon.png'),identity=JSON.parse(await readFile(folder+'/IDENTITY.json','utf8'));
if(identity.id!=='opcb.calendar'||identity.sha256!==createHash('sha256').update(icon).digest('hex')||!icon.equals(await readFile('src/identity-icons/assets/calender.png')))throw Error('Calendar identity mismatch');
const options={entryPoints:['src/calendar/plugin.mjs'],outfile:folder+'/plugin.js',bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',define:{OPCB_CALENDAR_CSS:JSON.stringify(await readFile('src/calendar/style.css','utf8')),OPCB_CALENDAR_ICON:JSON.stringify('data:image/png;base64,'+(await readFile(folder+'/icon.png')).toString('base64'))}};
if(process.argv.includes('--check')){const result=await build({...options,write:false});for(const file of result.outputFiles)if(await readFile(file.path,'utf8')!==file.text)throw Error('Stale calendar bundle');}else await build(options);
