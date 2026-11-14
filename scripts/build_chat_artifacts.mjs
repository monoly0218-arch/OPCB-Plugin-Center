import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
// API v1: statically inline the pinned shared UI and fonts; no runtime imports.
import {readFile, writeFile} from 'node:fs/promises';
import {bundleStyles} from '../src/chat-artifacts/ui-v3/scripts/build-styles.mjs';
const base = new URL('../src/chat-artifacts/', import.meta.url);
const [source, ui, sidebar] = await Promise.all(['main.mjs','ui-v3/react.mjs','sidebar.css'].map(p => readFile(new URL(p, base), 'utf8')));
const {css} = await bundleStyles();
const input = source
  .replace('import { createUI } from "./ui-v3/react.mjs";', ui.replaceAll('export ', ''))
  .replace('const ARTIFACT_STYLES = ""; // @bundle-artifact-styles', 'const ARTIFACT_STYLES = ' + JSON.stringify(css + '\n' + sidebar) + ';');
const result=await build({stdin:{contents:input,resolveDir:fileURLToPath(base),sourcefile:'main.mjs'},bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,legalComments:'eof',charset:'utf8'});
const built=result.outputFiles[0].text;
const output = new URL('../plugins/opcb.chat-artifacts/2.0.0/plugin.js', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== built) throw new Error('Chat artifacts build is stale; run npm run build:artifacts');
} else await writeFile(output, built);
