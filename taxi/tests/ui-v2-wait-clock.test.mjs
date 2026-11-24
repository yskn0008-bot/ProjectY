import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../ui-v2.html',import.meta.url),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'embedded runtime');
const OLD='yos-taxi-ui-v2-live-20261117',WAIT='yos-taxi-wait-clock-v1';
const SHIFT='2026-11-23T17:00:00+09:00';
const initial=()=>({version:1,businessDate:'2026-11-23',shiftStart:SHIFT,shiftEnd:null,events:[],photos:[{id:'kept-photo'}]});
function env({at='2026-11-23T20:00:00+09:00',ledger=initial(),wait=null,fail=false}={}){
  const clock={now:Date.parse(at)},store=new Map([['yos-taxi-ops-v1','keep-legacy']]),els=new Map();
  if(ledger!==null)store.set(OLD,JSON.stringify(ledger));
  if(wait!==null)store.set(WAIT,wait);
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
  runInNewContext(script,{window,document,localStorage,navigator:{},crypto:{randomUUID:()=> 'uuid-test'},
    location:{href:'https://example.test/ProjectY/taxi/ui-v2.html'},history:{state:null,replaceState(){}},
    addEventListener(){},setInterval(){},setTimeout(){return 1},clearTimeout(){},
    structuredClone:x=>JSON.parse(JSON.stringify(x)),Date:ClockDate,Intl,URL});
  return {clock,store,window,el:document.getElementById.bind(document)};
}
test('one neutral card, four tabs and legacy actions remain',()=>{
  assert.equal((html.match(/id="strategy-action"/g)||[]).length,1);
  assert.match(html,/data-decision="unknown"/);
  assert.match(html,/◌ 未判定/);
  assert.match(html,/取得時刻：なし/);
  for(const value of ['#51DDBC','#F4BC55','#85AFFC','sales-view','strategy-view','history-view','analysis-view','photo-btn','m100-rule-btn'])assert.ok(html.includes(value));
  assert.doesNotMatch(html,/\$\('strategy-main'\)\.textContent=item\[0\]/);
  assert.match(html,/index\.html\?legacy=1/);
});
test('unknown start never inferred from dropoff or an unstarted shift',()=>{
  const e=env({ledger:null});
  assert.equal(e.window.YOSTaxiPreview.waitClock.get().next,'待機開始未記録');
  assert.equal(e.window.YOSTaxiPreview.waitClock.start(),false);
  assert.equal(e.store.has(WAIT),false);
});
test('one-tap start stays in a separate store and duplicate is idempotent',()=>{
  const e=env(),w=e.window.YOSTaxiPreview.waitClock,old=e.store.get(OLD);
  assert.equal(w.start(),true);
  const first=e.store.get(WAIT);
  assert.equal(JSON.parse(first).startedAt,new Date(e.clock.now).toISOString());
  assert.equal(w.start(),false);
  assert.equal(e.store.get(WAIT),first);
  assert.equal(e.store.get(OLD),old);
  assert.equal(e.store.get('yos-taxi-ops-v1'),'keep-legacy');
});
test('five wait checkpoints and 30-minute overrun',()=>{
  const e=env(),w=e.window.YOSTaxiPreview.waitClock,start=e.clock.now;
  w.start();
  for(const [minute,next] of [[0,'あと5分｜5分観察'],[5,'あと5分｜10分点検'],
    [10,'あと5分｜15分再判定'],[15,'あと5分｜20分再検討'],
    [20,'あと10分｜30分原因確認'],[31,'30分超｜原因を確認']]){
    e.clock.now=start+minute*60000;
    assert.equal(w.get().next,next);
  }
});
test('reload and midnight do not reset the same shift timer',()=>{
  const e=env({at:'2026-11-23T23:59:00+09:00'});
  e.window.YOSTaxiPreview.waitClock.start();
  const same=env({at:'2026-11-24T00:06:00+09:00',wait:e.store.get(WAIT)});
  assert.equal(same.window.YOSTaxiPreview.waitClock.get().next,'あと3分｜10分点検');
  assert.equal(same.store.get(OLD),e.store.get(OLD));
});
test('manual stop, dropoff and shift end terminate without erasing photos',()=>{
  const e=env(),w=e.window.YOSTaxiPreview.waitClock;
  w.start();assert.equal(w.stop(),true);assert.equal(w.stop(),false);
  assert.equal(w.get().running,false);
  const d=env();d.window.YOSTaxiPreview.waitClock.start();
  assert.equal(d.window.YOSTaxiPreview.recordDropoff(),true);
  assert.equal(d.window.YOSTaxiPreview.waitClock.get().running,false);
  assert.equal(JSON.parse(d.store.get(WAIT)).endedReason,'dropoff');
  assert.equal(JSON.parse(d.store.get(OLD)).photos.length,1);
  const end=env();end.window.YOSTaxiPreview.waitClock.start();
  end.el('status-btn').onclick();
  const close=end.el('modal-actions').children.find(x=>x.textContent==='終了する');
  assert.ok(close);close.onclick();
  assert.equal(JSON.parse(end.store.get(WAIT)).endedReason,'shift_end');
  assert.equal(JSON.parse(end.store.get(OLD)).photos.length,1);
});
test('corrupt wait data and unavailable storage fail without rewriting either ledger',()=>{
  const bad=env({wait:'broken-json'});
  assert.equal(bad.window.YOSTaxiPreview.waitClock.start(),false);
  assert.equal(bad.store.get(WAIT),'broken-json');
  const blocked=env({fail:true});
  assert.equal(blocked.window.YOSTaxiPreview.waitClock.start(),false);
  assert.equal(blocked.store.has(WAIT),false);
  assert.equal(blocked.store.get('yos-taxi-ops-v1'),'keep-legacy');
});
test('timer from prior shift is not displayed as today wait',()=>{
  const prior=JSON.stringify({version:1,businessDate:'2026-11-22',shiftStart:'2026-11-22T17:00:00+09:00',
    startedAt:'2026-11-22T20:00:00+09:00',endedAt:null});
  const e=env({wait:prior});
  assert.equal(e.window.YOSTaxiPreview.waitClock.get().running,false);
  assert.equal(e.window.YOSTaxiPreview.waitClock.start(),true);
  assert.equal(JSON.parse(e.store.get(WAIT)).businessDate,'2026-11-23');
});


test('approved light dashboard preserves records and does not invent earnings',()=>{
  assert.match(html,/color-scheme:light/);
  assert.match(html,/id="monthly-view"/);
  assert.match(html,/id="monthly-calendar"/);
  assert.match(html,/id="remaining-shift"/);
  assert.match(html,/id="remaining-target"/);
  assert.match(html,/id="required-hourly"/);
  assert.match(html,/id="confirmed-hourly"/);
  assert.match(html,/経過日報を送る/);
  assert.match(html,/確認済み日報のみを集計/);
  assert.match(html,/id="monthly-sum-value"/);
   assert.match(html,/日報の確認額は未登録です。勤務時間・給与予測・Notion同期は未接続です。/);
  const e=env();
  assert.equal(e.el('sales-value').textContent,'—');
  assert.equal(e.el('required-hourly').textContent,'算出不可');
  assert.equal(e.el('remaining-shift').textContent,'未確認');
  assert.equal(e.store.get(OLD),JSON.stringify(initial()));
  assert.equal(e.store.get('yos-taxi-ops-v1'),'keep-legacy');
});
