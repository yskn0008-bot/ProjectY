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
