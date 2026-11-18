import {existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {runtimeOptions} from '../server/runtime.mjs';

let source,target,out,created=false;
try {
  const args=process.argv.slice(2),index=args.indexOf('--out');
  if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw new Error('使用 --out 指定新的私有 SQLite 文件；不会覆盖已有文件');
  const path=resolve(runtimeOptions().dir,'calendar.sqlite');
  if(!existsSync(path))throw new Error('源工作区不存在');
  out=resolve(args[index+1]);
  closeSync(openSync(out,'wx',0o600));created=true;
  source=new DatabaseSync(path,{readOnly:true});
  source.exec('BEGIN');
  // One SQLite read transaction captures state and receipts from the same version.
  const state=source.prepare('SELECT id,revision,body FROM state WHERE id=1').get();
  const operations=source.prepare('SELECT id,fingerprint,actor,result FROM operations').all();
  source.exec('COMMIT');
  if(!state)throw new Error('工作区数据不完整');
  target=new DatabaseSync(out);
  target.exec('CREATE TABLE state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE operations (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, actor TEXT NOT NULL, result TEXT NOT NULL); BEGIN');
  target.prepare('INSERT INTO state VALUES (?,?,?)').run(state.id,state.revision,state.body);
  const insert=target.prepare('INSERT INTO operations VALUES (?,?,?,?)');
  for(const op of operations)insert.run(op.id,op.fingerprint,op.actor,op.result);
  target.exec('COMMIT');target.close();target=undefined;
  console.log(JSON.stringify({exported:true,file:out,revision:state.revision,receipts:operations.length,credentialsIncluded:false}));
}catch(error){target?.close();target=undefined;if(created)unlinkSync(out);console.error(error.message);process.exitCode=1;}
finally{source?.close();target?.close();}
