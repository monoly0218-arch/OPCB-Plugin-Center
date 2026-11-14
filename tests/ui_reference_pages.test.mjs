import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUI} from '../design-system/v3/react.mjs';
import {createColoredIcons,ASSET_NAMES,createControlIcons,CONTROL_PATHS} from '../design-system/v3/icons.mjs';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
const base=new URL('../design-system/v3/',import.meta.url),h=React.createElement;
test('embedded font binaries match the approved manifest and ship licenses',async()=>{
 const fonts=JSON.parse(await readFile(new URL('fonts/MANIFEST.json',base),'utf8'));
 assert.equal(fonts.length,4);for(const f of fonts){const bytes=await readFile(new URL('fonts/'+f.file,base));assert.equal(bytes.toString('ascii',0,4),'wOF2');assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);assert.ok(f.glyphs>=390);}
 for(const file of ['NUNITO_OFL.txt','QUICKSAND_OFL.txt','RESOURCE_HAN_ROUNDED_OFL.txt'])assert.match(await readFile(new URL('fonts/'+file,base),'utf8'),/SIL OPEN FONT LICENSE/);
});
test('reference catalog distinguishes reconstruction from new specimens',async()=>{
 const pages=JSON.parse(await readFile(new URL('PAGES.json',base),'utf8'));
 assert.equal(new Set(pages.map(p=>p.id)).size,pages.length);assert.equal(pages.filter(p=>p.file).length,19);
 for(const p of pages.filter(p=>p.file)){assert.match(p.imageURL,/^https:\/\//);assert.match(p.url,/^https:\/\//);}
 assert.equal(pages.find(p=>p.id==='typography').kind,'specimen');assert.equal(pages.find(p=>p.id==='knowledge').kind,'adaptation');
});
test('objects and controls have independent accessible renderers; bitmap sources are fixed',async()=>{
 const Asset=createColoredIcons(React),Control=createControlIcons(React);
 for(const name of ASSET_NAMES){const svg=renderToStaticMarkup(h(Asset,{name}));assert.match(svg,/viewBox="0 0 24 24"/);assert.match(svg,/aria-hidden="true"/);assert.doesNotMatch(svg,/https?:/);}
 for(const name of Object.keys(CONTROL_PATHS))assert.match(renderToStaticMarkup(h(Control,{name})),/stroke-width="1.7"/);
 const assets=JSON.parse(await readFile(new URL('assets/MANIFEST.json',base),'utf8'));for(const a of assets){const bytes=await readFile(new URL('assets/'+a.file,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.equal(a.license,'MIT');}assert.match(await readFile(new URL('FLUENT_EMOJI_LICENSE.txt',base),'utf8'),/MIT License/);
});
test('bundled plugin styles include local font data and exclude review chrome',async()=>{
 const {css,assets}=await bundleStyles();assert.match(css,/data:font\/woff2;base64/);assert.doesNotMatch(css,/font-family:'OPCB Quicksand'/);assert.doesNotMatch(css,/review-bar|\.review-stage/);assert.match(assets.star,/^data:image\/png;base64,/);
 const markup=renderToStaticMarkup(h(createUI(React).Workspace,{font:'nunito',language:'zh'},'资料'));
 assert.match(markup,/data-font="nunito"/);assert.match(markup,/lang="zh"/);
});
