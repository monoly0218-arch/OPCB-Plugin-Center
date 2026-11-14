// Plain JS API v1: emit one self-contained module, with no runtime imports.
import {readFile, writeFile} from 'node:fs/promises';
const source = await readFile(new URL('../src/chat-artifacts/main.mjs', import.meta.url), 'utf8');
const output = new URL('../plugins/opcb.chat-artifacts/2.0.0/plugin.js', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== source) throw new Error('Chat artifacts build is stale; run npm run build:artifacts');
} else await writeFile(output, source);
