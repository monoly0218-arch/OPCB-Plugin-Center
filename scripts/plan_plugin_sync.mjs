#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {planPluginSync} from '../src/plugin-center/sync-plan.mjs';

try {
  const {values} = parseArgs({options: {
    installed: {type: 'string'}, baseline: {type: 'string'},
    platform: {type: 'string'}, 'host-version': {type: 'string'},
  }, allowPositionals: false});
  if (!values.installed) throw Error('用法：node scripts/plan_plugin_sync.mjs --installed <plugin_list.json|-> --platform macos --host-version <Buzz版本>');
  const baselinePath = values.baseline || fileURLToPath(new URL('../BASELINE.json', import.meta.url));
  let input;
  if (values.installed === '-') {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) throw Error('本机清单超出 2 MiB 限制');
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks).toString('utf8');
  } else input = await readFile(values.installed, 'utf8');
  if (Buffer.byteLength(input) > 2 * 1024 * 1024) throw Error('本机清单超出 2 MiB 限制');
  const plan = planPluginSync(JSON.parse(await readFile(baselinePath, 'utf8')), JSON.parse(input),
    {platform: values.platform, hostVersion: values['host-version']});
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`插件比对失败：${error.message}\n`);
  process.exitCode = 1;
}
