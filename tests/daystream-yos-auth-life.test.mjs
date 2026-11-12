import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const authCode=fs.readFileSync(new URL('../yos/daystream/yos-tasks-auth.js',import.meta.url),'utf8');
const sourceCode=fs.readFileSync(new URL('../yos/daystream/source-adapters.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../yos/daystream/index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');

test('YOS Tasks refresh reuses existing backend and is opt-in and read-only',()=>{
 assert.match(authCode,/https:\/\/project-y-yos-ai\.vercel\.app/);
 assert.match(authCode,/https:\/\/yskn0008-bot\.github\.io/);
 assert.match(authCode,/https:\/\/accounts\.google\.com\/gsi\/client/);
 assert.match(authCode,/\/api\/yos\/public-config/);
 assert.match(authCode,/\/api\/yos\/tasks/);
 assert.match(authCode,/credentials:'omit'/);
 assert.match(authCode,/cache:'no-store'/);
 assert.match(authCode,/method:'GET'/);
 assert.doesNotMatch(authCode,/localStorage|sessionStorage|NOTION_TOKEN|API_SECRET/);
 assert.match(html,/id="yosWebTaskRefresh"/);
 assert.match(html,/provider\.setup\(\{/);
 assert.match(html,/source:\u0027yos-auth-cache\u0027/); // source guard on persisted projected data
 assert.match(html,/<script src="\.\/yos-tasks-auth\.js"><\/script>/);
 assert.match(worker,/'\.\/yos\/daystream\/yos-tasks-auth\.js'/);
});
test('YOS Tasks credential is used transiently and only sanitized Tasks are saved',async()=>{
 let callback,rendered=false,serverCalls=[],sanitized=null;
 const google={accounts:{id:{
  initialize:settings=>{callback=settings.callback;assert.equal(settings.auto_select,false)},
  renderButton:()=>{rendered=true}
 }}};
 const local={window:null,google,YOS_DAYSTREAM_SOURCES:null};
 local.window=local;
 const ctx={window:local,location:{origin:'https://yskn0008-bot.github.io'},document:{},fetch:async(url,opts)=>{
  serverCalls.push({url,opts});
  if(url.endsWith('/public-config'))return {ok:true,json:async()=>({googleClientId:'valid-id.apps.googleusercontent.com'})};
  if(url.endsWith('/tasks'))return {ok:true,json:async()=>({tasks:[{title:'タスク',state:'次にやる',priority:'P1',due:'2026-11-13',order:2,nextAction:'確認',blocker:'SECRET_DO_NOT_STORE'}]})};
  throw Error('unexpected endpoint');
 },AbortController,setTimeout,clearTimeout,Date};
 vm.runInNewContext(sourceCode,ctx,{timeout:2000});
 vm.runInNewContext(authCode,ctx,{timeout:2000});
 const host={replaceChildren(){},getBoundingClientRect:()=>({width:280})},status={textContent:''};
 assert.equal(await local.YOS_DAYSTREAM_TASK_AUTH.setup({host,status,save:part=>{sanitized=part;return true}}),true);
 assert.equal(rendered,true);
 assert.equal(serverCalls.length,1,'identity setup only loads public config, no tasks before explicit sign-in');
 await callback({credential:'test-id-token'});
 assert.equal(serverCalls.length,2);
 assert.equal(serverCalls[1].opts.headers.Authorization,'Bearer test-id-token');
 assert.equal(sanitized.items.length,1);
 assert.equal(sanitized.items[0].blocker,undefined);
 assert.equal(sanitized.items[0].action,'確認');
 assert.equal(sanitized.source,'yos-auth-cache');
 assert.equal(local.YOS_DAYSTREAM_SOURCES.validSaved(sanitized,'tasks'),true);
});
test('cross-origin page cannot start YOS identity flow',async()=>{
 const win={};win.window=win;
 let requests=0;
 const ctx={window:win,location:{origin:'https://wrong.example.com'},fetch:async()=>{requests++},setTimeout,clearTimeout};
 vm.runInNewContext(authCode,ctx,{timeout:2000});
 const status={textContent:''};
 assert.equal(await win.YOS_DAYSTREAM_TASK_AUTH.setup({host:{},status,save:()=>true}),false);
 assert.equal(requests,0);
 assert.match(status.textContent,/正規サイト以外/);
});
test('existing MY WAY Life schedule is projected without changing source and split at Tokyo midnight',()=>{
 const win={};win.window=win;
 vm.runInNewContext(sourceCode,{window:win,Date,Intl,Math}, {timeout:2000});
 const life={days:{'2026-11-13':{schedule:[
  {title:'予定A',start:'2026-11-13T09:00:00+09:00',end:'2026-11-13T10:00:00+09:00'},
  {title:'日跨ぎ',start:'2026-11-13T23:50:00+09:00',end:'2026-11-14T00:20:00+09:00'}
 ]}}};
 const original=JSON.stringify(life);
 const projected=win.YOS_DAYSTREAM_SOURCES.fromYosLifeStore(life);
 assert.equal(projected.source,'yos-life-local');
 assert.equal(projected.status,'partial');
 assert.equal(projected.calendarDays['2026-11-13'][0].start,540);
 assert.equal(projected.calendarDays['2026-11-13'][1].duration,10);
 assert.equal(projected.calendarDays['2026-11-14'][0].duration,20);
 assert.equal(JSON.stringify(life),original,'projection does not mutate MY WAY data');
 assert.match(html,/既存MY WAY/);
 assert.match(html,/保存済みMY WAY生活予定/);
});
test('sanitized auth snapshot expires in six hours even when backup validity is extended',()=>{
 const win={};win.window=win;
 vm.runInNewContext(sourceCode,{window:win,Date,Intl,Math}, {timeout:2000});
 const adapter=win.YOS_DAYSTREAM_SOURCES;
 const cache={savedAt:Date.now(),data:{tasks:[{order:1,title:'My task',state:'次にやる'}]}};
 const snapshot=adapter.fromYosTaskDashboardCache(cache);
 assert.equal(adapter.validSaved(snapshot,'tasks'),true);
 snapshot.checkedAt=new Date(Date.now()-7*3600000).toISOString();
 assert.equal(adapter.validSaved(snapshot,'tasks',3650),false);
 assert.match(html,/existingYosCache\|\|importedTasks/);
});
