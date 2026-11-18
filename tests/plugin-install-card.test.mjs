import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseInstallCard,formatInstallCard,resolveInstallCard,createInstallCard,registerInstallCards,installationStatus} from '../src/plugin-center/install-card.mjs';
const sha='a'.repeat(40),pin='b'.repeat(40);
const entry={id:'opcb.example',version:'0.1.0',name:'测试插件',summary:'仅在详情显示',requirements:'条件不在首屏显示',sourcePath:'plugins/opcb.example/0.1.0',downloadPath:'releases/test.zip',reviewSource:{repository:'https://github.com/monoly0218-arch/OPCB-Plugin-Center.git',reference:'distribution/example',path:'.',commit:pin}};
const state={status:'ready',entries:[entry],commit:sha,busy:'',notice:'',error:''};
const store={snapshot:()=>state,subscribe:()=>()=>{},refresh:async()=>{},review:async()=>{throw Error('render must not install');}};

test('formats portable fallback and resolves only the exact catalog id, version and pin',()=>{
 const text=formatInstallCard(entry,sha),data=parseInstallCard(text);
 assert.deepEqual(data,{id:entry.id,release:entry.version,commit:pin});
 assert(text.includes(entry.name));assert(text.includes('https://gitee.com/miaopantao/OPCB-Plugin-Center/tree/'));
 assert.equal(resolveInstallCard(data,state),entry);
 for(const patch of [{commit:sha},{release:'0.2.0'},{id:'opcb.other'}])assert.equal(resolveInstallCard({...data,...patch},state),null);
 for(const status of ['idle','loading','error'])assert.equal(resolveInstallCard(data,{...state,status}),null);
});

test('rejects malformed, oversized and arbitrary source payloads instead of taking over ordinary messages',()=>{
 const valid=formatInstallCard(entry,sha);
 for(const text of ['hello',valid+' trailing',valid.replace('opcb-plugin-install','javascript'),valid.replace('"version":1','"version":2'),valid.replace('"commit":','"repository":"https://evil.invalid", "commit":'),valid.replace(pin,'not-a-sha'),'x'.repeat(9000),null])assert.equal(parseInstallCard(text),null);
 assert.equal(parseInstallCard({content:valid}).commit,pin);
});

test('first card is actual directory artwork and target version, with no small explanatory text or install side effects',()=>{
 const Card=createInstallCard(React,store,undefined,{puzzle:'data:image/png;base64,aGVsbG8='},'');
 const html=renderToStaticMarkup(React.createElement(Card,{message:{content:formatInstallCard(entry,sha)}}));
 assert(html.includes(entry.name));assert(html.includes('v0.1.0'));assert(html.includes('审阅安装'));assert(!html.includes(entry.summary));assert(!html.includes(entry.requirements));assert(!html.includes('<small'));
 const changed=renderToStaticMarkup(React.createElement(Card,{message:{content:formatInstallCard({...entry,version:'0.2.0'},sha)}}));
 assert(changed.includes('此版本已变化或未收录'));assert(!changed.includes('pc-message-install'));
});

test('missing or throwing installation status is unavailable, never an installed-version claim',()=>{
 assert.equal(installationStatus(undefined,entry.id),'unavailable');
 assert.equal(installationStatus({getInstallationStatus:()=>{throw Error('not ready');}},entry.id),'unavailable');
 assert.equal(installationStatus({getInstallationStatus:()=> 'installed'},entry.id),'installed');
});

test('registers the exact message surface and a read-only agent tool; native approval cards keep their host UI',async()=>{
 let renderer,tool;
 const ctx={react:React,conversation:{registerMessage:r=>{renderer=r;}},agents:{addTool:t=>{tool=t;}}};
 assert.equal(registerInstallCards(ctx,store,undefined,{},''),true);
 const content=formatInstallCard(entry,sha);
 assert(renderer.matches({content}));assert(!renderer.matches({content,pluginRequest:{id:'native'}}));assert(!renderer.matches({content:'ordinary'}));
 assert.equal(tool.name,'opcb_plugin_install_card');
 assert.equal(await tool.call(null,null,{id:entry.id}),content);
 await assert.rejects(tool.call(null,null,{id:'opcb.absent'}),/未找到/);
 assert.equal(registerInstallCards({react:React},store,undefined,{},''),false);
});
