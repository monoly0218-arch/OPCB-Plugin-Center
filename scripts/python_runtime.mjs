import {spawnSync} from 'node:child_process';
export function pythonRuntime(){
  for(const binary of [process.env.OPCB_KNOWLEDGE_PYTHON,'python3.12','python3'].filter(Boolean)){
    const result=spawnSync(binary,['-c','import hashlib; assert callable(hashlib.scrypt)'],{encoding:'utf8'});
    if(result.status===0)return binary;
  }
  throw Error('Python with hashlib.scrypt is required; set OPCB_KNOWLEDGE_PYTHON to its executable.');
}
