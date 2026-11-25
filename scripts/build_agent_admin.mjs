import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const dir = new URL('plugins/opcb.agent-admin/0.1.0/', root);
const icon = await readFile(new URL('icon.png', dir));
const canonical = await readFile(new URL('src/identity-icons/assets/shield.png', root));
if (!icon.equals(canonical)) throw new Error('Use the canonical shield icon');
const identity = JSON.stringify({ schema: 1, id: 'opcb.agent-admin', name: 'shield',
  url: 'https://3dicons.co/icons/b91186-shield?angle=dynamic', collection: 'V1',
  license: 'CC0-1.0', angle: 'dynamic', color: 'color',
  sha256: createHash('sha256').update(icon).digest('hex') }, null, 2) + '\n';
const { outputFiles } = await build({ entryPoints: ['src/agent-activation/admin.mjs'],
  bundle: true, format: 'esm', platform: 'browser', charset: 'utf8', write: false,
  define: { OPCB_AGENT_ADMIN_ICON: JSON.stringify(`data:image/png;base64,${icon.toString('base64')}`) } });
for (const [name, content] of [['plugin.js', outputFiles[0].text], ['IDENTITY.json', identity]]) {
  const path = new URL(name, dir);
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== content) throw new Error(`Stale agent admin ${name}`);
  } else await writeFile(path, content);
}
