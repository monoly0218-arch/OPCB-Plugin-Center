import {spawnSync} from 'node:child_process';
import {pythonRuntime} from './python_runtime.mjs';
const result=spawnSync(pythonRuntime(),['-m','unittest','discover','-s','services/knowledge','-p','test_*.py'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
