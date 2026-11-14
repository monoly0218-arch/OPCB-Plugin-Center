// Rebuild using the checked-in v3 font bytes. No network or runtime imports.
import { readFile, writeFile } from 'node:fs/promises';
const folder = new URL('../plugins/opcb.html-reader/0.1.0-rc.2/', import.meta.url);
const css = await readFile(new URL('source/reader.css', folder), 'utf8');
const python = await readFile(new URL('source/viewer.py', folder), 'utf8');
const fonts = JSON.parse(await readFile(new URL('source/fonts.json', folder), 'utf8'));
const reader = await readFile(new URL('source/reader.mjs', folder), 'utf8');
// Module evaluation only defines values; all browser work starts in apply.
const constants = `\nconst READER_CSS=${JSON.stringify(css)};\nconst VIEWER_SOURCE=${JSON.stringify(python)};\nconst FONT_DATA=${JSON.stringify(fonts)};\n`;
const effect = `\n  ctx.effect(() => {\n    if (typeof FontFace !== 'function') return;\n    let stopped = false; const loaded = [];\n    for (const font of FONT_DATA) {\n      const bytes = Uint8Array.from(atob(font.data), c => c.charCodeAt(0));\n      const face = new FontFace(font.family, bytes, { weight: font.weight });\n      face.load().then(value => { if (!stopped) { document.fonts.add(value); loaded.push(value); } }).catch(() => {});\n    }\n    return () => { stopped = true; loaded.forEach(face => document.fonts.delete(face)); };\n  });\n`;
const output=reader.replace('  const R = ctx.react, h = R.createElement;', '  const R = ctx.react, h = R.createElement;' + effect) + constants;
if(process.argv.includes('--check')){if(await readFile(new URL('plugin.js',folder),'utf8')!==output)throw Error('Stale HTML reader bundle');}
else await writeFile(new URL('plugin.js',folder),output);
console.log('Built HTML reader (single ES module).');
