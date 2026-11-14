import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../revenue-goal-v1.js',import.meta.url),'utf8');
const root={};
vm.runInNewContext(script,{globalThis:root,Date,Intl,Number,JSON,String,Map,Math,RegExp,Object,Array},{filename:'revenue-goal-v1.js'});
const api=root.YosTaxiRevenueGoalV1;
const opts={month:'2026-12',goal:1000000,plannedShifts:23,plannedHours:175,assumedFare:1500};
const at=new Date('2026-12-15T12:00:00+09:00');

test('月商100万円を実働175時間と23乗務から逆算する',()=>{
 const r=api.compute({}, {}, null,opts,at);
 assert.equal(r.baselinePerHour,5715);
 assert.equal(r.baselinePerShift,43479);
 assert.equal(r.perShift,43479);
 assert.equal(r.perHour,5715);
 assert.equal(r.ridesPerShift,29);
 assert.equal(r.hasRecords,false);
 assert.equal(r.worked,0);
 assert.equal(r.recordedHours,0);
});

test('営業カレンダーの修正済み売上を集計し、別月を混入しない',()=>{
 const cal={days:{
  '2026-12-01':{status:'work',sales:30000,actualHours:7},
  '2026-12-02':{status:'work',sales:35000,actualHours:7.5},
  '2026-11-30':{status:'work',sales:900000,actualHours:12}
 }};
 const r=api.compute(cal,{},null,opts,at);
 assert.equal(r.totalSales,65000);
 assert.equal(r.worked,2);
 assert.equal(r.remainingShifts,21);
 assert.equal(r.remainingSales,935000);
 assert.equal(r.remainingHours,160.5);
 assert.equal(r.perShift,44524);
 assert.equal(r.ridesPerShift,30);
 assert.equal(r.dailyAverage,32500);
});

test('未計測の実働時間をゼロ時間として取り扱わない',()=>{
 const cal={days:{'2026-12-01':{status:'work',sales:30000}}};
 const r=api.compute(cal,{},null,opts,at);
 assert.equal(r.hoursKnown,false);
 assert.equal(r.remainingHours,null);
 assert.equal(r.perHour,null);
 assert.equal(r.perShift,Math.ceil(970000/22));
});

test('営業途中の記録は同日カレンダーと二重加算しない',()=>{
 const current=new Date('2026-12-02T16:00:00Z'); // 12/03 01:00 JST, business date 12/02
 assert.equal(api.businessDate(current),'2026-12-02');
 const cal={days:{'2026-12-02':{status:'work',sales:37000,actualHours:8}}};
 const ops={businessDate:'2026-12-02',status:'available',shiftStart:'2026-12-02T12:00:00Z',events:[
  {type:'降車',fare:2000,tip:100},{type:'乗車',waitMs:600000}
 ]};
 const r=api.compute(cal,{},ops,opts,current);
 assert.equal(r.live,true);
 assert.equal(r.worked,1);
 assert.equal(r.totalSales,2100);
 assert.equal(r.entries[0].source,'Taxi営業中');
 assert.ok(r.entries[0].hours>0);
});

test('過去の営業終了データを現在のライブ扱いしない',()=>{
 const cal={days:{'2026-12-02':{status:'work',sales:37000,actualHours:8}}};
 const ops={businessDate:'2026-12-02',status:'ended',events:[{type:'降車',fare:1000}]};
 const r=api.compute(cal,{},ops,opts,new Date('2026-12-02T16:00:00Z'));
 assert.equal(r.live,false);
 assert.equal(r.totalSales,37000);
});

test('月次持越と実働記録の不明を区別し、合算する',()=>{
 const cal={days:{'2026-12-01':{status:'work',sales:30000,actualHours:7}}};
 const settings={months:{'2026-12':{carrySales:20000,carryHours:0}}};
 const r=api.compute(cal,settings,null,opts,at);
 assert.equal(r.totalSales,50000);
 assert.equal(r.hoursKnown,false);
 assert.equal(r.perHour,null);
});

test('別アプリの記録を変更しない読み取り専用画面とPWA経路を保つ',async()=>{
 const html=await readFile(new URL('../revenue-goal.html',import.meta.url),'utf8');
 const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const overlay=await readFile(new URL('../final-app-v131.js',import.meta.url),'utf8');
 const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/apple-mobile-web-app-capable/);
 assert.match(html,/revenue-goal-v1\.js/);
 assert.match(html,/id="targetValue"/);
 assert.match(html,/id="recentDays"/);
 assert.match(html,/会社評価の税抜・配車手数料控除後売上は未計算/);
 assert.match(html,/運転中の操作は禁止/);
 assert.match(index,/href="\.\/revenue-goal\.html"/);
 assert.match(overlay,/href="\.\/revenue-goal\.html"/);
 assert.match(sw,/revenue-goal\.html/);
 assert.match(sw,/revenue-goal-v1\.js/);
 assert.match(sw,/v149-revenue-goal/);
 assert.match(script,/const KEY='yos-taxi-revenue-goal-v1'/);
 assert.doesNotMatch(script,/localStorage\.setItem\(CAL,/);
 assert.doesNotMatch(script,/localStorage\.setItem\(OPS,/);
 assert.doesNotMatch(script,/fetch\(/);
});
