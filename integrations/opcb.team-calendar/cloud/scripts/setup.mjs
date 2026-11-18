import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {runtimeOptions,version} from '../server/runtime.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {profile,configPath}=runtimeOptions();
const args=file=>[resolve(root,'server',file),'--'+profile,'--config',configPath];
writeFileSync(resolve(root,'plugin/manifest.json'),JSON.stringify({id:'opcb.team-calendar',name:'团队日历 '+version,apiVersion:1,description:'多项目统一日历、团队整月排期与会议安排，界面和 MCP 共用数据。',discovery:{category:'productivity',tags:['calendar','team','tasks']},host:{commands:[{id:'calendar-client',program:'node',args:args('client.mjs'),maxInputBytes:65536,maxOutputBytes:1048576}],processes:[{id:'calendar-events',program:'node',args:args('events.mjs')}]}},null,2));
console.log(`Plugin paths configured (${profile}).`);
