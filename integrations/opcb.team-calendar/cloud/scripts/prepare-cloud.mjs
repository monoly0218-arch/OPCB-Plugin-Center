import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {runtimeOptions} from '../server/runtime.mjs';
import {connectionUrl} from '../server/connection.mjs';
import {hash,id} from '../server/state.mjs';

// Prepare private files only. Never sends SQL, tokens or changes to a server.
const args=process.argv.slice(2);
function option(key){const i=args.indexOf(key);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw new Error(key+' 参数缺失');return args[i+1];}
let db;
try {
  const out=resolve(option('--out')),members=JSON.parse(readFileSync(resolve(option('--members')),'utf8')),url=connectionUrl(option('--url'),{shared:true});
  if(existsSync(out))throw new Error('输出目录已存在，请为新的部署准备选择独立目录');
  if(!Array.isArray(members)||!members.length)throw new Error('需要明确的成员与设备清单');
  const database=resolve(runtimeOptions().dir,'calendar.sqlite');if(!existsSync(database))throw new Error('源工作区不存在');
  db=new DatabaseSync(database,{readOnly:true});db.exec('BEGIN');
  const row=db.prepare('SELECT revision,body FROM state WHERE id=1').get(),operations=db.prepare('SELECT id,fingerprint,actor,result FROM operations').all();
  db.exec('COMMIT');const state=JSON.parse(row.body);
  const credentials=members.map(m=>{
    id(m.memberId);id(m.deviceId);if(!['owner','editor','viewer'].includes(m.role)||!/^[a-f0-9]{64}$/.test(m.pubkey||''))throw new Error('成员公钥或权限格式不正确');
    const member=state.members.find(x=>x.id===m.memberId);if(!member)throw new Error('成员不存在：'+m.memberId);
    if(member.buzzPubkey&&member.buzzPubkey!==m.pubkey)throw new Error('成员已有其他身份绑定，停止生成');
    member.buzzPubkey=m.pubkey;
    return {...m,token:randomBytes(32).toString('hex')};
  });
  if(new Set(credentials.map(c=>c.deviceId)).size!==credentials.length)throw new Error('设备 ID 重复');
  const bound=state.members.filter(m=>m.buzzPubkey).map(m=>m.buzzPubkey);if(new Set(bound).size!==bound.length)throw new Error('成员身份重复');
  mkdirSync(out,{mode:0o700});
  const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
  let sql='-- Fresh calendar workspace only; fails rather than overwriting existing data.\nBEGIN;\nSET LOCAL standard_conforming_strings=on;\n';
  sql+=`INSERT INTO opcb_calendar.workspace VALUES(1,${row.revision},${literal(JSON.stringify(state))}::jsonb);\n`;
  for(const c of credentials) {
    sql+=`INSERT INTO opcb_calendar.devices(token_hash,actor,role,pubkey) VALUES(${literal(hash(c.token))},${literal('device:'+c.deviceId)},${literal(c.role)},${literal(c.pubkey)});\n`;
    writeFileSync(resolve(out,c.deviceId+'.json'),JSON.stringify({url,transport:'supabase',token:c.token,actor:'device:'+c.deviceId,role:c.role,pubkey:c.pubkey},null,2),{flag:'wx',mode:0o600});
  }
  for(const op of operations)sql+=`INSERT INTO opcb_calendar.operations VALUES(${literal(op.id)},${literal(op.fingerprint)},${literal(op.actor)},${literal(op.result)}::jsonb);\n`;
  sql+='COMMIT;\nSELECT revision, jsonb_array_length(body->\'tasks\') AS tasks FROM opcb_calendar.workspace WHERE id=1;\n';
  writeFileSync(resolve(out,'002_INITIALIZE_PRIVATE.sql'),sql,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({prepared:true,directory:out,revision:row.revision,tasks:state.tasks.length,devices:credentials.map(c=>({id:c.deviceId,role:c.role,memberId:c.memberId})),deployed:false}));
}catch(error){console.error(error.message);process.exitCode=1;}finally{db?.close();}
