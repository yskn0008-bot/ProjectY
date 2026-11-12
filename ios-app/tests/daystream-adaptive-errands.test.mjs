import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file=new URL('../scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url);
const src=fs.readFileSync(file,'utf8');
const block=src.match(/\/\/ YOS_ADAPTIVE_ERRANDS_START([\s\S]*?)\/\/ YOS_ADAPTIVE_ERRANDS_END/);
assert.ok(block,'engine marker must exist');
const fn=vm.runInNewContext(block[1]+';yosOutingCandidates');
const context={confirmed:true,calendarVerified:true,day:'2026-11-12',windowStart:600,windowEnd:690,freeMinutes:45,route:[{placeId:'b',order:2,detourMinutes:5,openConfirmed:true},{placeId:'a',order:1,detourMinutes:5,openConfirmed:true}]};
const tasks=[{id:'t2',title:'後の店舗',placeId:'b',durationMinutes:10,priority:'P1',status:'次にやる'},{id:'t1',title:'先の店舗',placeId:'a',durationMinutes:10,priority:'P2',status:'次にやる'}];
test('safe fail closed without confirmed context',()=>{assert.equal(fn(tasks,null,[],'2026-11-12').proposals.length,0);assert.equal(fn(tasks,{...context,confirmed:false},[],'2026-11-12').proposals.length,0)});
test('preserves source objects and uses confirmed route order',()=>{const before=JSON.stringify(tasks);const out=fn(tasks,context,[],'2026-11-12');assert.deepEqual(Array.from(out.proposals,x=>x.id),['t1','t2']);assert.equal(JSON.stringify(tasks),before);assert.ok(out.proposals[0].reason.includes('寄り道'))});
test('does not fabricate unknown place, opening hours or duration',()=>{const out=fn([{id:'unknown',title:'不明',status:'次にやる',placeId:'a'}, {...tasks[0],id:'closed',placeId:'closed'}],context,[],'2026-11-12');assert.equal(out.proposals.length,0);assert.equal(out.excluded.length,2)});
test('does not include already placed or completed tasks',()=>{const out=fn([...tasks,{...tasks[0],id:'done',status:'完了'}],context,[{sourceRef:'notion:t1',s:480,d:20}],'2026-11-12');assert.deepEqual(Array.from(out.proposals,x=>x.id),['t2'])});
test('bounded time and overdue are respected',()=>{const out=fn([{...tasks[0],id:'past',due:'2026-11-10'},{...tasks[1],durationMinutes:41}],context,[],'2026-11-12');assert.equal(out.proposals.length,0)});
test('visual preview is informational, without source updates',()=>{assert.ok(src.includes('id="yosOutingPanel"'));assert.ok(src.includes('yosRenderOuting();'));assert.ok(!block[1].includes('persist('));assert.ok(!block[1].includes('Request('));});

test('rejects unknown calendar and mismatched date, prevents conflicting suggestions',()=>{
 assert.equal(fn(tasks,{...context,calendarVerified:false},[],'2026-11-12').proposals.length,0);
 assert.equal(fn(tasks,{...context,day:'2026-11-13'},[],'2026-11-12').proposals.length,0);
 const clash=fn(tasks,context,[{s:605,d:30,kind:'schedule',f:1}], '2026-11-12');
 assert.deepEqual(Array.from(clash.proposals,x=>[x.start,x.end]),[[635,650],[650,665]]);
 const blocked=fn(tasks,context,[{s:605,d:80,kind:'schedule',f:1}], '2026-11-12');
 assert.equal(blocked.proposals.length,0);
});
test('proposes bounded non-overlapping times and re-evaluates after time change',()=>{
 const first=fn(tasks,context,[],'2026-11-12');
 assert.deepEqual(Array.from(first.proposals,x=>[x.start,x.end]),[[600,615],[615,630]]);
 const changed=fn(tasks,{...context,windowStart:660,windowEnd:675},[],'2026-11-12');
 assert.deepEqual(Array.from(changed.proposals,x=>x.id),['t1']);
 assert.equal(changed.proposals[0].start,660);
});
test('outing panel is attached to task tab rather than hidden permanently',()=>{
 assert.match(src,/getElementById\('yosOutingPanel'\)\.classList\.toggle\('show',name==='task'\)/);
});

test('date validation survives Scriptable HTML template interpolation',()=>{
 assert.match(block[1],/\[0-9\]\{4\}/);
 assert.ok(!block[1].includes('\\\\d'), 'must not rely on an escaped regex through nested template strings');
});

test('invalid occupancy fails safely instead of assuming the calendar is clear',()=>{
 const out=fn(tasks,context,[{s:610,d:null,kind:'schedule'}],'2026-11-12');
 assert.equal(out.proposals.length,0);
 assert.match(out.reason,/確認に失敗/);
});
test('replan skips multiple appointments without moving them and respects remaining budget',()=>{
 const out=fn(tasks,context,[{s:602,d:18,kind:'schedule'},{s:627,d:13,kind:'schedule'}],'2026-11-12');
 assert.deepEqual(Array.from(out.proposals,x=>[x.start,x.end]),[[640,655],[655,670]]);
 assert.equal(out.proposals[0].order,1);
 const short=fn(tasks,{...context,freeMinutes:15},[],'2026-11-12');
 assert.deepEqual(Array.from(short.proposals,x=>x.id),['t1']);
});

test('bundles two tasks at one confirmed store without double-counting the detour',()=>{
 const near={...context,route:[{placeId:'a',order:1,detourMinutes:10,openConfirmed:true}],freeMinutes:35};
 const errands=[{...tasks[1],id:'first',durationMinutes:10},{...tasks[1],id:'second',durationMinutes:10}];
 const out=fn(errands,near,[],'2026-11-12');
 assert.equal(out.proposals.length,2);
 assert.deepEqual(Array.from(out.proposals,x=>x.minutes),[20,10]);
 assert.deepEqual(Array.from(out.proposals,x=>x.detourMinutes),[10,0]);
 assert.deepEqual(Array.from(out.proposals,x=>[x.start,x.end]),[[600,620],[620,630]]);
});
test('skipped first task never falsely removes the detour charge for the next one',()=>{
 const near={...context,route:[{placeId:'a',order:1,detourMinutes:10,openConfirmed:true}],freeMinutes:30};
 const errands=[{...tasks[1],id:'too-large',durationMinutes:40},{...tasks[1],id:'can-go',durationMinutes:20}];
 const out=fn(errands,near,[],'2026-11-12');
 assert.deepEqual(Array.from(out.proposals,x=>x.id),['can-go']);
 assert.equal(out.proposals[0].detourMinutes,10);
 assert.equal(out.proposals[0].minutes,30);
});
