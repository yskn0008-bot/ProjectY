import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url),'utf8');
const block=src.match(/\/\/ YOS_OUTING_INPUT_BRIDGE_START([\s\S]*?)\/\/ YOS_OUTING_INPUT_BRIDGE_END/);
assert.ok(block,'native input bridge must exist');
const parse=vm.runInNewContext("function key(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}\n"+block[1]+"\nyosReadOutingInput",{Date});
const now=new Date('2026-11-12T10:00:00');
const day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const notionId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const coverage={status:'ok',from:'2026-11-01',until:'2026-12-01'};
const taskSource={status:'ok',items:[{id:notionId,title:'薬局に立ち寄る',status:'次にやる'}]};
const valid={schema:'yos-outing-preview-v1',source:'user-confirmed',confirmed:true,issuedAt:now.toISOString(),day,windowStart:660,windowEnd:720,freeMinutes:60,route:[{placeId:'pharmacy',order:1,detourMinutes:8,openConfirmed:true}],taskDetails:[{id:notionId,placeId:'pharmacy',durationMinutes:12}]};
test('accepts fresh manually confirmed, bound Notion task details without mutating source',()=>{
 const before=JSON.stringify(taskSource),out=parse(valid,taskSource,coverage,now);
 assert.equal(out.context.day,day);
 assert.equal(out.context.calendarVerified,true);
 assert.equal(out.taskDetails[0].id,notionId);
 assert.equal(JSON.stringify(taskSource),before);
});
test('rejects missing, stale and future Shortcut manifests',()=>{
 for(const invalid of [null,'{bad json}',{...valid,confirmed:false},{...valid,source:'automatic'},{...valid,issuedAt:new Date(now.getTime()-360000).toISOString()},{...valid,issuedAt:new Date(now.getTime()+120000).toISOString()}]){
  assert.equal(parse(invalid,taskSource,coverage,now).context,null);
 }
});
test('rejects unavailable Notion or incomplete Apple calendar coverage',()=>{
 assert.equal(parse(valid,{...taskSource,status:'partial'},coverage,now).context,null);
 assert.equal(parse(valid,taskSource,{...coverage,status:'partial'},now).context,null);
 assert.equal(parse({...valid,day:'2027-01-01'},taskSource,coverage,now).context,null);
});
test('rejects unknown task IDs and unverified places or durations',()=>{
 for(const changed of [
  {...valid,taskDetails:[{id:'missing',placeId:'pharmacy',durationMinutes:12}]},
  {...valid,taskDetails:[{id:notionId,placeId:'unknown',durationMinutes:12}]},
  {...valid,taskDetails:[{id:notionId,placeId:'pharmacy',durationMinutes:null}]},
  {...valid,route:[{...valid.route[0],openConfirmed:false}]},
  {...valid,route:[{...valid.route[0],detourMinutes:-1}]},
 ])assert.equal(parse(changed,taskSource,coverage,now).context,null);
});
test('rejects past today time windows and accepts JSON string input',()=>{
 assert.equal(parse({...valid,windowStart:500},taskSource,coverage,now).context,null);
 assert.equal(parse(JSON.stringify(valid),taskSource,coverage,now).context.day,day);
});
test('one-shot bridge does not write to Notion or change Apple Calendar',()=>{
 assert.ok(!block[1].includes('writeString('));
 assert.ok(!block[1].includes('new Request('));
 assert.match(src,/outingContext:outingInput.context/);
 assert.match(src,/outingTaskDetails:outingInput.taskDetails/);
 assert.match(src,/yosOutingCandidates\(previewTasks,/);
 assert.match(src,/const previewTasks=yosManualPreview\?sourceTasks\.map/);
});

test('screen refuses stale outing previews and rechecks while open',()=>{
 assert.match(src,/issuedAt:raw\.issuedAt/);
 assert.match(src,/current\.getTime\(\)-issued<=300000/);
 assert.match(src,/if\(document\.getElementById\('yosOutingPanel'\)\.classList\.contains\('show'\)\)yosRenderOuting\(\)/);
});

test('outings are not suggested over unclassified all-day Apple appointments',()=>{
 assert.match(src,/const allDayClear=!Array\.isArray\(allDayDays\[selectedDay\]\)\|\|allDayDays\[selectedDay\]\.length===0/);
 assert.match(src,/const live=fresh&&allDayClear/);
});
