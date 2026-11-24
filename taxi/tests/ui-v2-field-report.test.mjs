import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../ui-v2.html',import.meta.url),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'embedded runtime');
const OLD='yos-taxi-ui-v2-live-20261117',WAIT='yos-taxi-wait-clock-v1',FIELD='yos-taxi-field-reports-v1';
const SHIFT='2026-11-23T17:00:00+09:00';
const initial=()=>({version:1,businessDate:'2026-11-23',shiftStart:SHIFT,shiftEnd:null,events:[],photos:[{id:'kept-photo'}]});
function env({at='2026-11-23T20:00:00+09:00',ledger=initial(),wait=null,field=null,fail=false}={}){
  const clock={now:Date.parse(at)},store=new Map([['yos-taxi-ops-v1','keep-legacy']]),els=new Map();
  let uuidSeq=0;
  if(ledger!==null)store.set(OLD,JSON.stringify(ledger));
  if(wait!==null)store.set(WAIT,wait);
  if(field!==null)store.set(FIELD,field);
  const make=()=>({dataset:{},style:{},children:[],textContent:'',disabled:false,hidden:false,
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(kind,fn){this['on'+kind]=fn},
    replaceChildren(){this.children=[]},
    append(...x){this.children.push(...x)},focus(){}});
  const document={
    getElementById(id){if(!els.has(id))els.set(id,make());return els.get(id)},
    querySelectorAll(){return []},createElement:make,addEventListener(){},visibilityState:'visible'
  };
  const localStorage={
    getItem(k){return store.has(k)?store.get(k):null},
    setItem(k,v){if(fail)throw Error('quota');store.set(k,v)},
    removeItem(){throw Error('must not delete')}
  };
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}}
  const window={};
  runInNewContext(script,{window,document,localStorage,navigator:{},crypto:{randomUUID:()=> 'uuid-test-'+(++uuidSeq)},
    location:{href:'https://example.test/ProjectY/taxi/ui-v2.html'},history:{state:null,replaceState(){}},
    addEventListener(){},setInterval(){},setTimeout(){return 1},clearTimeout(){},
    structuredClone:x=>JSON.parse(JSON.stringify(x)),Date:ClockDate,Intl,URL});
  return {clock,store,window,el:document.getElementById.bind(document)};
}

test('a single report entry point does not become a wait/cruise/move selector',()=>{
  assert.equal((html.match(/id="field-open"/g)||[]).length,1);
  assert.equal((html.match(/data-observation="/g)||[]).length,10);
  assert.match(html,/現状を報告/);
  assert.match(html,/本人の現場観測/);
  assert.match(html,/id="strategy-action" data-decision="unknown"/);
  assert.doesNotMatch(html,/data-observation="wait"|data-observation="cruise"|data-observation="move"/);
});
test('manual observation saves one event without touching shift, wait or legacy data',()=>{
  const e=env(),base=e.store.get(OLD),w=e.window.YOSTaxiPreview.waitClock;
  w.start();const wait=e.store.get(WAIT);
  assert.equal(e.window.YOSTaxiPreview.fieldReport.record('go_none'),true);
  const data=JSON.parse(e.store.get(FIELD));
  assert.equal(data.version,1);
  assert.equal(data.entries.length,1);
  assert.equal(data.entries[0].kind,'go_none');
  assert.equal(data.entries[0].source,'manual-tap');
  assert.equal(data.entries[0].locationStatus,'unverified');
  assert.equal(data.entries[0].businessDate,'2026-11-23');
  assert.equal(e.store.get(OLD),base);
  assert.equal(e.store.get(WAIT),wait);
  assert.equal(e.store.get('yos-taxi-ops-v1'),'keep-legacy');
  assert.equal(e.el('strategy-action').dataset.decision,undefined);
});
test('duplicate same observation in four seconds is blocked; different facts allowed',()=>{
  const e=env(),r=e.window.YOSTaxiPreview.fieldReport;
  assert.equal(r.record('queue_still'),true);
  assert.equal(r.record('queue_still'),false);
  assert.equal(r.record('go_none'),true);
  assert.equal(JSON.parse(e.store.get(FIELD)).entries.length,2);
  e.clock.now+=5000;
  assert.equal(r.record('go_none'),true);
  assert.equal(JSON.parse(e.store.get(FIELD)).entries.length,3);
});
test('undo retains a voided audit entry and stops repeated accidental cancellation',()=>{
  const e=env(),r=e.window.YOSTaxiPreview.fieldReport;
  r.record('supply_many');
  e.clock.now+=5000;r.record('radio_none');
  assert.equal(r.undo(),true);
  assert.equal(r.list().length,1);
  assert.equal(r.list()[0].kind,'supply_many');
  const all=JSON.parse(e.store.get(FIELD)).entries;
  assert.equal(all.length,2);
  assert.ok(all[1].voidedAt);
  assert.equal(r.undo(),false);
  const afterReload=env({field:e.store.get(FIELD)});
  assert.equal(afterReload.window.YOSTaxiPreview.fieldReport.undo(),false);
  assert.equal(e.store.get(OLD)!==undefined,true);
});
test('report persists through reload and midnight; only same shift events visible',()=>{
  const e=env({at:'2026-11-23T23:58:00+09:00'}),r=e.window.YOSTaxiPreview.fieldReport;
  r.record('queue_moves');
  const raw=e.store.get(FIELD);
  const reloaded=env({at:'2026-11-24T00:05:00+09:00',field:raw});
  assert.equal(reloaded.window.YOSTaxiPreview.fieldReport.list().length,1);
  const next=initial();next.businessDate='2026-11-24';next.shiftStart='2026-11-24T17:00:00+09:00';
  const future=env({at:'2026-11-24T20:00:00+09:00',ledger:next,field:raw});
  assert.equal(future.window.YOSTaxiPreview.fieldReport.list().length,0);
  assert.equal(future.store.get(FIELD),raw);
});
test('inactive shift and invalid kind are never written',()=>{
  const e=env({ledger:null}),r=e.window.YOSTaxiPreview.fieldReport;
  assert.equal(r.record('go_none'),false);
  assert.equal(r.record('not_known'),false);
  assert.equal(e.store.has(FIELD),false);
});
test('corrupt ledger is preserved instead of overwritten',()=>{
  const e=env({field:'{BROKEN'}),r=e.window.YOSTaxiPreview.fieldReport;
  assert.equal(r.record('go_yes'),false);
  assert.equal(e.store.get(FIELD),'{BROKEN');
  assert.equal(e.store.get(OLD)!==undefined,true);
});
test('storage errors report failure and preserve shift ledger',()=>{
  const e=env({fail:true}),r=e.window.YOSTaxiPreview.fieldReport;
  const old=e.store.get(OLD);
  assert.equal(r.record('radio_none'),false);
  assert.equal(e.store.has(FIELD),false);
  assert.equal(e.store.get(OLD),old);
});
test('observations never invent a recommendation, GO data feed or actual taxi supply',()=>{
  const e=env(),r=e.window.YOSTaxiPreview.fieldReport;
  r.record('go_yes');r.record('supply_many');
  assert.equal(e.el('strategy-main').textContent,'');
  assert.match(html,/id="strategy-main">◌ 未判定/);
  assert.equal(e.el('strategy-action').dataset.decision,undefined);
  assert.equal(r.list().length,2);
  assert.ok(r.list().every(x=>x.source==='manual-tap'));
});


test('YOS handoff includes only confirmed local manual reports, with no network call',()=>{
  const e=env(),r=e.window.YOSTaxiPreview.fieldReport,old=e.store.get(OLD);
  r.record('go_none');e.clock.now+=60000;r.record('supply_many');
  const saved=e.store.get(FIELD);
  const result=r.prepareYosRequest();
  assert.equal(result.status,'prepared-not-sent');
  assert.equal(result.sent,false);
  assert.equal(result.source,'manual-tap');
  assert.deepEqual(Array.from(result.eventsUsed),JSON.parse(saved).entries.map(x=>x.id));
  assert.match(result.request.userText,/GO反応なし/);
  assert.match(result.request.userText,/空車が多い/);
  assert.match(result.request.userText,/本人による手動タップ/);
  assert.match(result.request.userText,/現在地：未確認/);
  assert.match(result.request.userText,/未判定/);
  assert.doesNotMatch(result.request.userText,/¥|回送先：/);
  assert.equal(e.store.get(FIELD),saved);
  assert.equal(e.store.get(OLD),old);
  assert.equal(e.store.get('yos-taxi-ops-v1'),'keep-legacy');
});
test('YOS handoff never includes canceled reports or fabricated location',()=>{
  const e=env(),r=e.window.YOSTaxiPreview.fieldReport;
  r.record('go_yes');e.clock.now+=5000;r.record('queue_still');r.undo();
  const result=r.prepareYosRequest();
  assert.equal(result.status,'prepared-not-sent');
  assert.match(result.request.userText,/GO反応あり/);
  assert.doesNotMatch(result.request.userText,/待機列が動かない/);
  assert.match(result.request.userText,/現在地：未確認/);
});
test('YOS handoff fails closed without a fresh observation or confirmed shift',()=>{
  const inactive=env({ledger:null}).window.YOSTaxiPreview.fieldReport.prepareYosRequest();
  assert.equal(inactive.status,'shift-unconfirmed');assert.equal(inactive.request,null);
  const noReport=env().window.YOSTaxiPreview.fieldReport.prepareYosRequest();
  assert.equal(noReport.status,'no-fresh-facts');assert.equal(noReport.request,null);
  const e=env(),r=e.window.YOSTaxiPreview.fieldReport;
  r.record('radio_none');e.clock.now+=31*60000;
  const stale=r.prepareYosRequest();
  assert.equal(stale.status,'no-fresh-facts');assert.equal(stale.request,null);
});
test('YOS handoff rejects corrupt storage and excludes another shift event',()=>{
  const bad=env({field:'{broken'}).window.YOSTaxiPreview.fieldReport.prepareYosRequest();
  assert.equal(bad.status,'storage-error');assert.equal(bad.request,null);
  const previous=JSON.stringify({version:1,entries:[{id:'past',businessDate:'2026-11-22',shiftStart:'2026-11-22T17:00:00+09:00',at:'2026-11-23T19:59:00+09:00',kind:'go_none',source:'manual-tap',locationStatus:'unverified'}]});
  const shifted=env({field:previous}).window.YOSTaxiPreview.fieldReport.prepareYosRequest();
  assert.equal(shifted.status,'no-fresh-facts');
});
test('YOS handoff uses the explicitly started wait timer, not last dropoff time',()=>{
  const e=env(),r=e.window.YOSTaxiPreview.fieldReport;
  r.record('go_none');e.clock.now+=3*60000;
  const before=r.prepareYosRequest().request.userText;
  assert.match(before,/正確な待機開始時刻：未確認/);
  assert.equal(e.window.YOSTaxiPreview.waitClock.start(),true);
  e.clock.now+=5*60000;
  const after=r.prepareYosRequest().request.userText;
  assert.match(after,/端末で開始を記録した待機時間：5分/);
  assert.doesNotMatch(after,/正確な待機開始時刻：未確認/);
});


test('YOS transport only starts on explicit click and reuses the existing ephemeral credential client',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport,old=e.store.get(OLD);
  let count=0,got=null,tokenCalls=0;
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH={getGoogleIdToken:async()=>{tokenCalls++;return 'ephemeral-only'}};
  e.window.YosAiClient=class{
    constructor(opts){assert.equal(opts.baseUrl,e.window.YOS_AI_BASE_URL);assert.equal(typeof opts.getGoogleIdToken,'function')}
    async chat(input){count++;got=input;return {answer:'確認できた情報だけで安全に判断してください'};}
  };
  f.record('go_none');
  assert.equal(count,0);assert.equal(tokenCalls,0);
  assert.equal(await f.sendToYos(),true);
  assert.equal(count,1);
  assert.match(got.userText,/GO反応なし/);
  assert.equal(e.el('field-yos-answer').textContent,'確認できた情報だけで安全に判断してください');
  assert.equal(e.el('field-yos-answer').hidden,false);
  assert.equal(e.el('strategy-action').dataset.decision,undefined);
  assert.equal(e.store.get(OLD),old);
  assert.doesNotMatch(JSON.stringify([...e.store.entries()]),/ephemeral-only|確認できた情報だけで/);
});
test('YOS transport refuses unknown HTTPS providers and missing identity client before sending',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport;
  f.record('go_none');
  let sent=0;
  e.window.YosAiClient=class{async chat(){sent++;return {answer:'untrusted'}}};
  e.window.YOS_AUTH={getGoogleIdToken:async()=>'token'};
  e.window.YOS_AI_BASE_URL='https://attacker.example';
  assert.equal(await f.sendToYos(),false);
  assert.equal(sent,0);
  assert.match(e.el('field-yos-status').textContent,/公式接続先/);
  assert.equal(e.el('field-yos-answer').hidden,true);
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH=null;
  assert.equal(await f.sendToYos(),false);
  assert.equal(sent,0);
});
test('YOS transport failures preserve reports and never render fake responses',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport;
  f.record('queue_still');
  const original=e.store.get(FIELD);
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH={getGoogleIdToken:async()=>'token'};
  e.window.YosAiClient=class{async chat(){throw Object.assign(Error('auth'),{status:403})}};
  assert.equal(await f.sendToYos(),false);
  assert.match(e.el('field-yos-status').textContent,/接続許可/);
  assert.equal(e.el('field-yos-answer').hidden,true);
  assert.equal(e.store.get(FIELD),original);
  e.window.YosAiClient=class{async chat(){return {answer:null}}};
  assert.equal(await f.sendToYos(),false);
  assert.equal(e.el('field-yos-answer').hidden,true);
});
test('YOS consultation never sends a second request while one is pending',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport;
  f.record('go_none');
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH={getGoogleIdToken:async()=>'token'};
  let release,count=0;
  e.window.YosAiClient=class{async chat(){count++;return await new Promise(resolve=>{release=resolve})}};
  const first=f.sendToYos();
  assert.equal(await f.sendToYos(),false);
  assert.equal(count,1);
  release({answer:'未判定です'});
  assert.equal(await first,true);
  assert.equal(count,1);
});
test('late YOS answer does not replace new observations',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport;
  f.record('go_none');
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH={getGoogleIdToken:async()=>'token'};
  let release;
  e.window.YosAiClient=class{async chat(){return await new Promise(resolve=>{release=resolve})}};
  const pending=f.sendToYos();
  e.clock.now+=6000;
  f.record('supply_many');
  release({answer:'古い情報の提案'});
  assert.equal(await pending,false);
  assert.equal(e.el('field-yos-answer').hidden,true);
  assert.doesNotMatch(e.el('field-yos-answer').textContent,/古い情報/);
  assert.match(e.el('field-yos-status').textContent,/新しい報告/);
});
test('YOS send is not available for stale observations',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport;
  f.record('radio_none');e.clock.now+=31*60000;
  let networkCalls=0;
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH={getGoogleIdToken:async()=>'token'};
  e.window.YosAiClient=class{async chat(){networkCalls++;return {answer:'no'}}};
  assert.equal(await f.sendToYos(),false);
  assert.equal(networkCalls,0);
});

test('YOS answer is invalidated after a report is undone',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport;
  f.record('go_none');
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH={getGoogleIdToken:async()=>'token'};
  e.window.YosAiClient=class{async chat(){return {answer:'前の情報だけに基づく回答'}}};
  assert.equal(await f.sendToYos(),true);
  assert.equal(e.el('field-yos-answer').hidden,false);
  assert.equal(f.undo(),true);
  assert.equal(e.el('field-yos-answer').hidden,true);
  assert.equal(e.el('field-yos-answer').textContent,'');
  assert.match(e.el('field-yos-status').textContent,/前の回答は現在の判断ではありません/);
});
test('YOS answer expires after thirty minutes and is hidden on refresh',async()=>{
  const e=env(),f=e.window.YOSTaxiPreview.fieldReport;
  f.record('radio_none');
  e.window.YOS_AI_BASE_URL='https://project-y-yos-ai.vercel.app';
  e.window.YOS_AUTH={getGoogleIdToken:async()=>'token'};
  e.window.YosAiClient=class{async chat(){return {answer:'過去の参考回答'}}};
  assert.equal(await f.sendToYos(),true);
  assert.equal(e.el('field-yos-answer').hidden,false);
  e.clock.now+=31*60000;
  f.refresh();
  assert.equal(e.el('field-yos-send').hidden,true);
  assert.equal(e.el('field-yos-answer').hidden,true);
  assert.equal(e.el('field-yos-answer').textContent,'');
  assert.match(e.el('field-yos-status').textContent,/古くなった/);
});
