import { DatabaseSync } from 'node:sqlite';
import {randomBytes} from 'node:crypto';

export {CalendarError} from './state.mjs';
import {CalendarError,fail,hash,id,canonical,applyMutation} from './state.mjs';

export function openStore(path, initial, credentials = []) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, actor TEXT NOT NULL, result TEXT NOT NULL); CREATE TABLE IF NOT EXISTS credentials (hash TEXT PRIMARY KEY, actor TEXT NOT NULL, role TEXT NOT NULL);');
  if(!db.prepare('PRAGMA table_info(credentials)').all().some(column=>column.name==='pubkey'))db.exec('ALTER TABLE credentials ADD COLUMN pubkey TEXT');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS device_actor ON credentials(actor) WHERE substr(actor,1,7)='device:'");
  db.prepare('INSERT OR IGNORE INTO state VALUES (1,0,?)').run(JSON.stringify(initial));
  for (const c of credentials) {
    if(c.pubkey&&!/^[0-9a-f]{64}$/.test(c.pubkey))fail('连接绑定的用户公钥格式不正确');
    db.prepare('INSERT OR REPLACE INTO credentials (hash,actor,role,pubkey) VALUES (?,?,?,?)').run(hash(c.token),c.actor,c.role,c.pubkey||null);
  }
  function authorize(token) { const p = db.prepare('SELECT actor,role,pubkey FROM credentials WHERE hash=?').get(hash(token || '')); return p || fail('未授权访问此日历',401); }
  // Local administration only. These functions are never exposed as HTTP actions.
  function issueDevice({deviceId,memberId,role='editor'}) {
    id(deviceId);
    if(!['owner','editor','viewer'].includes(role))fail('设备权限只能是 owner、editor 或 viewer');
    const actor='device:'+deviceId;
    const state=read({role:'owner'});
    const member=state.members.find(m=>m.id===memberId);
    if(!member?.buzzPubkey)fail('请先将该成员关联到真实 Buzz 用户，再签发设备连接');
    if(db.prepare('SELECT 1 FROM credentials WHERE actor=?').get(actor))fail('设备 ID 已存在；请先撤销旧连接或使用新的设备 ID',409);
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO credentials (hash,actor,role,pubkey) VALUES (?,?,?,?)').run(hash(token),actor,role,member.buzzPubkey);
    return {token,actor,role,pubkey:member.buzzPubkey};
  }
  function revokeDevice(deviceId) {id(deviceId);return db.prepare('DELETE FROM credentials WHERE actor=?').run('device:'+deviceId).changes>0;}
  function listDevices() {return db.prepare("SELECT actor,role,pubkey FROM credentials WHERE substr(actor,1,7)='device:' ORDER BY actor").all().map(p=>({deviceId:p.actor.slice(7),role:p.role,memberId:read({role:'owner'}).members.find(m=>m.buzzPubkey===p.pubkey)?.id||null}));}
  function read(principal) {
    if (!principal || !['owner','editor','viewer'].includes(principal.role)) fail('无权读取',403);
    const row = db.prepare('SELECT * FROM state WHERE id=1').get();
    const state=JSON.parse(row.body);
    return {...state,revision:row.revision,role:principal.role,currentUserPubkey:principal.pubkey||null,currentMemberId:principal.pubkey?state.members.find(m=>m.buzzPubkey===principal.pubkey)?.id||null:null};
  }
  function operation(principal, requestId) {
    read(principal);
    const row=db.prepare('SELECT actor,result FROM operations WHERE id=?').get(id(requestId));
    if(!row) fail('操作尚未保存',404);
    if(row.actor!==principal.actor) fail('无权读取该操作',403);
    return JSON.parse(row.result);
  }
  function mutate(principal, request) {
    if(!principal || !['owner','editor'].includes(principal.role)) fail('没有编辑权限',403);
    const requestId=id(request.requestId);
    if(!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision<0) fail('需要读取当前版本后再保存');
    const fingerprint=hash(canonical(request));
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous=db.prepare('SELECT * FROM operations WHERE id=?').get(requestId);
      if(previous) {
        if(previous.actor!==principal.actor || previous.fingerprint!==fingerprint) fail('请求标识已被其他内容使用',409);
        db.exec('COMMIT'); return {...JSON.parse(previous.result),replayed:true};
      }
      const current=read(principal);
      if(current.revision!==request.expectedRevision) fail('安排已被更新，当前草稿已保留；请载入最新版本后再提交',409);
      const {state,revision}=applyMutation(current,principal,request);
      db.prepare('UPDATE state SET revision=?,body=? WHERE id=1').run(revision,JSON.stringify(state));
      const result={requestId,revision,saved:true};
      db.prepare('INSERT INTO operations VALUES (?,?,?,?)').run(requestId,fingerprint,principal.actor,JSON.stringify(result));
      db.exec('COMMIT'); return result;
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  return {authorize,read,mutate,operation,issueDevice,revokeDevice,listDevices,close:()=>db.close()};
}
