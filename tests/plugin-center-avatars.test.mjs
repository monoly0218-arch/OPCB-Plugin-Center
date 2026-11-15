import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {avatarSource} from '../src/plugin-center/avatar-source.mjs';
import {subscribeContributorProfiles,CONTRIBUTIONS} from '../src/plugin-center/contributors.mjs';
import {createPage} from '../src/plugin-center/page.mjs';

test('community and GitHub avatars use the session small media path, never a raw private URL',()=>{
 const calls=[],media=(...args)=>{calls.push(args);return 'media://localhost/authenticated-small';};
 const url='https://community.example/media/current.jpg';
 assert.equal(avatarSource(url,media),'media://localhost/authenticated-small');
 assert.deepEqual(calls,[[url,'small']]);
 assert.equal(avatarSource(url),undefined);
 assert.equal(avatarSource('https://avatars.githubusercontent.com/u/123',media),'media://localhost/authenticated-small');
 for(const value of ['file:///private/a','http://example.com/a','javascript:alert(1)','https://user:secret@example.com/a','data:image/svg+xml,<svg/>'])assert.equal(avatarSource(value,media),undefined);
 const inline='data:image/png;base64,eA==';assert.equal(avatarSource(inline,()=>{throw Error('inline needs no host read');}),inline);
 assert.equal(avatarSource(url,()=>{throw Error('disconnected');}),undefined);
});

test('a live profile update is read and cache invalidations re-ensure visible identities, then unsubscribe',()=>{
 let generation=1,evictions=0,listener,released=0,reserved,reads=0,changes=0;
 const key=CONTRIBUTIONS.people.pantao.pubkey;
 let profiles=new Map([[key,{name:'潘涛',picture:'https://example.com/old.jpg'}]]);
 const directory={snapshot:()=>profiles,generation:()=>generation,evictions:()=>evictions,
  reserve:n=>{reserved=n;return()=>released++;},
  subscribe:f=>{listener=f;return()=>{listener=undefined;};},
  ensure:async ids=>{assert(listener);assert.deepEqual(ids,[key]);reads++;},
 };
 const off=subscribeContributorProfiles(directory,[key],()=>changes++);
 assert.equal(reads,1);assert.equal(reserved,1);assert.equal(changes,1);
 profiles=new Map([[key,{name:'潘涛',picture:'https://example.com/new.jpg'}]]);listener();
 assert.equal(directory.snapshot().get(key).picture,'https://example.com/new.jpg');assert.equal(changes,2);assert.equal(reads,1);
 profiles=new Map();generation++;listener();assert.equal(reads,2);
 evictions++;listener();assert.equal(reads,3);
 off();assert.equal(listener,undefined);assert.equal(released,1);
});

test('the real page resolves the latest signed profile picture through its current session media',()=>{
 const person=CONTRIBUTIONS.people.pantao,key=person.pubkey,url='https://community.example/media/new-photo.jpg',calls=[];
 const profiles={snapshot:()=>new Map([[key,{name:person.name,picture:url}]]),subscribe:()=>()=>{},ensure:async()=>{}};
 const connection={scope:'community:viewer',generation:2,session:{profiles,media:(source,size)=>{calls.push([source,size]);return 'media://localhost/current-photo';}}};
 const relay={snapshot:()=>connection,subscribe:()=>()=>{}};
 const snapshot={status:'ready',entries:[{id:'opcb.plugin-center',name:'插件中心',version:'0.2.4',category:'工具'}],contributions:CONTRIBUTIONS};
 const Page=createPage(React,{snapshot:()=>snapshot,subscribe:()=>()=>{}},undefined,{},'',relay);
 const html=renderToStaticMarkup(React.createElement(Page));
 assert(html.includes('src="media://localhost/current-photo"'));assert(!html.includes(url));assert(!html.includes(person.avatar));
 assert.deepEqual(calls,[[url,'small']]);
});
