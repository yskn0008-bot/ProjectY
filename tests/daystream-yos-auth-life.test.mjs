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
 assert.match(html,/snapshot\.source!==\u0027yos-auth-cache\u0027/); // source guard on persisted projected data
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
  if(url.endsWith('/tasks?source=notion'))return {ok:true,json:async()=>({source:'notion',complete:true,tasks:[{id:'11111111222233334444555555555555',title:'タスク',state:'次にやる',priority:'P1',due:'2026-11-13',order:2,nextAction:'確認',blocker:'SECRET_DO_NOT_STORE'}]})};
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
 assert.match(html,/existingLifeSchedule/);
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

test('completion cancellation removes learning record; rejected storage does not mutate in-memory plan',()=>{
 assert.match(html,/undoCompletion\(event\)/);
 assert.match(html,/if\(saved\)\{if\(target\.done\)window\.YOS_DAYSTREAM_WEB\.logCompletion/);
 assert.match(html,/else window\.YOS_DAYSTREAM_WEB\.undoCompletion\(\{id:target\.id,day:selectedDay\}\)/);
 assert.match(html,/if\(saved&&x\.kind==='task'\)/);
 assert.match(html,/const prior=x\.done;x\.done=!x\.done;const saved=persist\(\);if\(!saved\)x\.done=prior/);
 assert.match(html,/const next=\{version:1,days:\{\.\.\.savedDays,\[selectedDay\]:entries\},hiddenCalendar\}/);
 assert.match(html,/if\(ok\)\{savedDays\[selectedDay\]=entries;/);
 assert.match(html,/if\(typeof starts\[key\]==='string'&&Number\.isFinite\(Date\.parse\(starts\[key\]\)\)\)return true/);
});

test('failed or partial Notion fetch never saves over the previous snapshot',async()=>{
 for(const result of [{ok:false,status:503},{ok:true,json:async()=>({source:'notion',complete:false,tasks:[]})},{ok:true,json:async()=>({tasks:[]})}]){
  let callback,saves=0;
  const win={google:{accounts:{id:{initialize:s=>{callback=s.callback},renderButton(){}}}}};win.window=win;
  const ctx={window:win,location:{origin:'https://yskn0008-bot.github.io'},document:{},AbortController,setTimeout,clearTimeout,Date,Intl,Math,fetch:async(url)=>url.endsWith('/public-config')?{ok:true,json:async()=>({googleClientId:'test.apps.googleusercontent.com'})}:result};
  vm.runInNewContext(sourceCode,ctx);vm.runInNewContext(authCode,ctx);
  const status={textContent:''};
  await win.YOS_DAYSTREAM_TASK_AUTH.setup({host:{replaceChildren(){},getBoundingClientRect:()=>({width:280})},status,save:()=>{saves++;return true}});
  await callback({credential:'test-id-token'});
  assert.equal(saves,0);assert.match(status.textContent,/取得|件数/);
 }
});

function adapter(){const window={};window.window=window;vm.runInNewContext(sourceCode,{window,Date,Intl,Math});return window.YOS_DAYSTREAM_SOURCES;}
const id='11111111222233334444555555555555';
const task=(overrides={})=>({id,title:'Task',state:'次にやる',order:1000,due:'2026-11-13T15:00:00Z',dueEnd:'2026-11-13T16:00:00Z',habitCycle:'毎週',area:'Work',...overrides});
const cache=tasks=>({savedAt:Date.now(),data:{source:'notion',complete:true,tasks}});
test('Notion dates use Tokyo day and preserve exact timestamps without scheduling deadlines',()=>{
 const a=adapter(),result=a.fromYosTaskDashboardCache(cache([task()]));
 assert.equal(result.status,'ok');assert.equal(result.origin,'notion');
 assert.equal(result.items[0].due,'2026-11-14');
 assert.equal(result.items[0].dueAt,'2026-11-13T15:00:00Z');
 assert.equal(result.items[0].dueEnd,'2026-11-13T16:00:00Z');
 assert.equal(result.items[0].timing,'timed-deadline');assert.equal(result.items[0].habitCycle,'毎週');
 assert.equal(result.items[0].start,undefined,'habit start time is never invented');
 assert.equal(result.items[0].area,'Work');
});
test('stable Notion IDs survive renaming, order/state changes, reload and resend',()=>{
 const first=adapter().fromYosTaskDashboardCache(cache([task()]));
 const next=adapter().fromYosTaskDashboardCache(cache([task({title:'Rename',order:1,state:'完了'})]));
 assert.equal(first.items[0].id,next.items[0].id);assert.equal(next.items[0].status,'完了');
 assert.equal(adapter().validSaved(JSON.parse(JSON.stringify(next)),'tasks'),true);
});
test('all-day and undated tasks remain flexible, with no invented date or duration',()=>{
 const result=adapter().fromYosTaskDashboardCache(cache([task({due:'2026-11-13',dueEnd:null}),task({id:'aaaaaaaa222233334444555555555555',due:null,dueEnd:null})]));
 assert.equal(result.items[0].due,'2026-11-13');assert.equal(result.items[0].timing,'flexible');
 assert.equal(result.items[1].due,'');assert.equal(result.items[1].dueAt,null);
 assert.equal(result.items[0].duration,undefined);
});
test('duplicates and malformed/incomplete authoritative snapshots cannot replace a good copy',()=>{
 const a=adapter();
 for(const tasks of [[task(),task()],[task({id:''})],[task({state:'unknown'})],[task({due:'2026-11-13T09:00:00'})],[task({due:'2026-02-30'})],[task({due:'2026-11-13T24:00:00Z'})],[task({dueEnd:'2026-11-10'})]]) assert.equal(a.fromYosTaskDashboardCache(cache(tasks)),null);
 const incomplete=cache([task()]);incomplete.data.complete=false;
 assert.equal(a.fromYosTaskDashboardCache(incomplete),null);
 const expired=cache([task()]);expired.savedAt-=7*3600000;
 assert.equal(a.fromYosTaskDashboardCache(expired),null);
});
test('source snapshots exclude credentials and private notes',()=>{
 const result=adapter().fromYosTaskDashboardCache(cache([task({blocker:'SECRET',completion:'SECRET',evidence:'SECRET',token:'SECRET'})]));
 assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});
