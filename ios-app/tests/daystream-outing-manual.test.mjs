import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url),'utf8');
const begin='// YOS_OUTING_MANUAL_CAPTURE_START',end='// YOS_OUTING_MANUAL_CAPTURE_END';
const block=source.slice(source.indexOf(begin),source.indexOf(end)+end.length);
const id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
function make(overrides={}){
 const entries={
  yosOutingManualStatus:{textContent:''},
  yosOutingTaskChoice:{value:id},
  yosOutingPlace:{value:'本人が営業を確認した窓口'},
  yosOutingDetour:{value:'10'},yosOutingDuration:{value:'15'},
  yosOutingStart:{value:'11:00'},yosOutingEnd:{value:'12:00'},
  yosOutingConfirmed:{checked:true}
 };
 Object.assign(entries,overrides);
 const doc={getElementById:k=>entries[k]};
 let draws=0;
 const tasks=[{id,title:'手続き',status:'次にやる'}],initial=JSON.stringify(tasks);
 const FakeDate=class extends Date {constructor(...args){super(...(args.length?args:['2026-11-12T10:00:00']))}};
 const ctx={document:doc,Date:FakeDate,sourceTasks:tasks,taskSource:{status:'ok',checkedAt:'2026-11-12T10:00:00'},calendarCoverage:{status:'ok'},boot:{generatedAt:'2026-11-12T10:00:00'},calendarByDay:{},
 selectedDay:'2026-11-12',allDayDays:{},items:[],localISO:()=> '2026-11-12',
 isCalendarCovered:()=>true,yosIsPlanned:()=>false,yosRenderOuting:()=>{draws++}};
 const api=vm.runInNewContext('let yosManualPreview=null;\n'+block+'\n({capture:yosOutingManualCapture,snapshot:()=>yosManualPreview})',ctx);
 return {entries,ctx,tasks,initial,api,get draws(){return draws}};
}
test('manual confirmation uses existing Notion task and ephemeral preview without data writes',()=>{
 const x=make();assert.equal(x.api.capture(),true);
 const out=x.api.snapshot();assert.equal(out.id,id);
 assert.equal(out.context.route[0].detourMinutes,10);
 assert.equal(out.context.freeMinutes,60);
 assert.equal(out.context.route[0].openConfirmed,true);
 assert.equal(x.initial,JSON.stringify(x.tasks));
 assert.equal(x.draws,1);
 assert.doesNotMatch(block,/Keychain|fm\.write|CalendarEvent\.save|new Request|fetch\(/);
});
test('manual preview fails closed without confirmed route and operating status',()=>{
 for(const bad of [{yosOutingConfirmed:{checked:false}},{yosOutingPlace:{value:''}},{yosOutingDetour:{value:'-1'}},{yosOutingDuration:{value:'NaN'}}]){
  const x=make(bad);assert.equal(x.api.capture(),false);assert.equal(x.api.snapshot(),null);
 }
});
test('manual preview stops on unknown calendar or uncertain all-day appointment',()=>{
 for(const mutate of [x=>x.ctx.calendarCoverage.status='partial',x=>x.ctx.allDayDays={'2026-11-12':['終日予定']},x=>x.ctx.items=[{s:610,d:null}],x=>x.entries.yosOutingStart.value='09:00']){
  const x=make();mutate(x);assert.equal(x.api.capture(),false);assert.equal(x.api.snapshot(),null);
 }
});
test('manual preview deducts fixed appointments from its confirmed free-time budget',()=>{
 const x=make();x.ctx.items=[{s:670,d:20},{s:675,d:20}];
 assert.equal(x.api.capture(),true);assert.equal(x.api.snapshot().context.freeMinutes,35);
});
test('manual capture is integrated into the existing task panel and still expires',()=>{
 assert.match(source,/id="yosOutingManual"/);
 assert.match(source,/yosOutingManualSetup\(\);yosRenderSources\(\)/);
 assert.match(source,/const context=yosManualPreview\?\.context\|\|boot\.outingContext/);
 assert.match(source,/current\.getTime\(\)-issued<=300000/);
 assert.match(source,/function yosRenderSources\(\)\{\s*yosRenderLearningHints\(\);\s*yosRenderOuting\(\)/);
});

test('hidden Apple appointments remain occupied when they are not in visible items',()=>{
 const x=make();x.ctx.calendarByDay={'2026-11-12':[{start:665,duration:20,title:'非表示のApple予定'}]};
 assert.equal(x.api.capture(),true);
 assert.equal(x.api.snapshot().context.freeMinutes,40);
});
test('manual capture refuses stale Apple or Notion snapshots and invalid local entries',()=>{
 for(const mutate of [
  x=>x.ctx.boot.generatedAt='2026-11-12T09:45:00',
  x=>x.ctx.taskSource.checkedAt='2026-11-12T09:45:00',
  x=>x.ctx.items=[null],
  x=>x.ctx.calendarByDay={'2026-11-12':[{start:670,duration:null}]}
 ]){
  const x=make();mutate(x);assert.equal(x.api.capture(),false);
  assert.equal(x.api.snapshot(),null);
 }
});
