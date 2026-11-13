import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../yos/daystream/source-adapters.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../yos/daystream/index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
const root={Date,Error};root.window=root;
vm.runInNewContext(code,root,{timeout:2000});
const a=root.YOS_DAYSTREAM_SOURCES;
const ICS=(blocks)=>'BEGIN:VCALENDAR\nVERSION:2.0\n'+blocks.join('\n')+'\nEND:VCALENDAR\n';
const EV=(id,start,end,more='')=>'BEGIN:VEVENT\nUID:'+id+'\nSUMMARY:Testing '+id+'\nDTSTART'+start+'\nDTEND'+end+'\n'+more+'END:VEVENT';

function sourceWriter(initial,fail){
 const values=new Map(initial===null?[]:[['source',initial]]),alerts=[];let injected=false;
 const localStorage={getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key),setItem(key,value){
  if(key==='source'&&!injected&&fail){injected=true;if(fail==='throw')throw Error('quota');values.set(key,'incomplete');return}
  values.set(key,value);
 }};
 const fragment=html.slice(html.indexOf(' const writeSource='),html.indexOf(' const web={'));
 return {write:vm.runInNewContext(fragment+'writeSource',{localStorage,alert:m=>alerts.push(m)}),values,alerts};
}
test('failed source readback restores the previous import and preserves its backup',()=>{
 const old=JSON.stringify({prior:'予定'}),h=sourceWriter(old,'mismatch');
 assert.equal(h.write('source',{next:'新しい予定'}),false);
 assert.equal(h.values.get('source'),old);assert.equal(h.values.get('source_BACKUP'),old);assert.deepEqual(h.alerts,[]);
});
test('failed first import cannot leave partial source data, and thrown writes preserve existing data',()=>{
 const first=sourceWriter(null,'mismatch');assert.equal(first.write('source',{next:true}),false);assert.equal(first.values.has('source'),false);
 const previous=sourceWriter('previous','throw');assert.equal(previous.write('source',{next:true}),false);assert.equal(previous.values.get('source'),'previous');
});
test('successful source import is read back and retains the original copy',()=>{
 const h=sourceWriter('previous');assert.equal(h.write('source',{next:'確認'}),true);assert.equal(h.values.get('source'),JSON.stringify({next:'確認'}));assert.equal(h.values.get('source_BACKUP'),'previous');
});

test('source adapter is syntax safe and does not call networks or access credentials',()=>{
 new vm.Script(code);
 assert.ok(a&&typeof a.parseICS==='function'&&typeof a.normalizeTasks==='function');
 assert.doesNotMatch(code,/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|Keychain|Authorization|https?:\/\//);
 assert.match(worker,/'\.\/yos\/daystream\/source-adapters\.js'/);
 assert.match(html,/<script src="\.\/source-adapters\.js"><\/script>/);
});
test('calendar import projects timed event and all-day event without mutating source',()=>{
 const input=ICS([
  EV('one',':20261113T090000',':20261113T093000'),
  EV('two',';VALUE=DATE:20261114',';VALUE=DATE:20261115')
 ]);
 const result=a.parseICS(input);
 assert.deepEqual(JSON.parse(JSON.stringify(result.calendarDays['2026-11-13'])),[{title:'Testing one',start:540,duration:30}]);
 assert.deepEqual(Array.from(result.allDayDays['2026-11-14']),['Testing two']);
 assert.equal(result.status,'ok');
 assert.equal(result.eventCount,2);
});
test('overnight event splits per day and unsupported recurrence is explicitly partial',()=>{
 const input=ICS([
  EV('overnight',':20261113T235000',':20261114T002000'),
  EV('recurring',':20261114T100000',':20261114T110000','RRULE:FREQ=DAILY\n')
 ]);
 const result=a.parseICS(input);
 assert.equal(result.calendarDays['2026-11-13'][0].duration,10);
 assert.equal(result.calendarDays['2026-11-14'][0].duration,20);
 assert.equal(result.status,'partial');
 assert.equal(result.skippedCount,1);
});
test('reject broken/too large calendars and do not invent unsupported timezone',()=>{
 assert.throws(()=>a.parseICS('not an ICS'));
 assert.throws(()=>a.parseICS('BEGIN:VCALENDAR\n'+('a'.repeat(1001000))));
 const result=a.parseICS(ICS([
  EV('unsupported',';TZID=America/Los_Angeles:20261113T090000',';TZID=America/Los_Angeles:20261113T093000'),
  EV('supported',':20261113T093000',':20261113T100000')
 ]));
 assert.equal(result.status,'partial');
 assert.equal(result.calendarDays['2026-11-13'].length,1);
});
test('task snapshot is bounded and rejects missing title, state and invalid date',()=>{
 const input={items:[{id:'12345678-1234-1234-1234-123456789012',title:'確認のタスク',status:'次にやる',priority:'P1',due:'2026-11-13'}]};
 const snapshot=a.normalizeTasks(input);
 assert.equal(snapshot.items.length,1);
 assert.equal(snapshot.items[0].due,'2026-11-13');
 assert.equal(snapshot.source,'user-file');
 assert.ok(a.validSaved(snapshot,'tasks'));
 assert.throws(()=>a.normalizeTasks({items:[{id:'not-valid',title:'',status:'ok'}]}));
 assert.throws(()=>a.normalizeTasks({items:[{id:'12345678-1234-1234-1234-123456789012',title:'x',status:'次にやる',due:'2026-11-31'}]}));
 assert.throws(()=>a.normalizeTasks({items:new Array(401).fill(input.items[0])}));
});
test('expired import cannot be presented as current and source is read-only',()=>{
 const snapshot=a.normalizeTasks({items:[]});
 snapshot.checkedAt='2026-01-01T00:00:00.000Z';
 assert.equal(a.validSaved(snapshot,'tasks'),false);
 assert.match(html,/status:'partial'/);
 assert.match(html,/自動同期なし/);
 assert.match(html,/Notion Tasks：/);
});
test('confirmed start is distinct from completion; browser preserves native plan',()=>{
 assert.match(html,/id="startActualBtn"/);
 assert.match(html,/markStarted\(event\)/);
 assert.match(html,/YOS_DAYSTREAM_WEB_STARTS_V1/);
 assert.match(html,/if\(saved&&x.kind==='task'\)\{if\(x.done\)window\.YOS_DAYSTREAM_WEB\.logCompletion/);
 assert.match(html,/else window\.YOS_DAYSTREAM_WEB\.undoCompletion\(\{id:x.id,day:selectedDay\}\)/);
 assert.match(html,/startedAt/);
 assert.match(html,/開始時刻は未確認/);
 assert.doesNotMatch(code,/YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1\.json/);
});

test('one portable backup includes schedule, starts, completions and read-only imports',()=>{
 assert.match(html,/yos-daystream-web-all-backup-v1/);
 assert.match(html,/importAll\(p\)/);
 assert.match(html,/schema:'yos-daystream-web-all-backup-v1'/);
 assert.match(html,/YOS_DAYSTREAM_WEB_ALL_BACKUP\.json/);
 assert.match(html,/if\(!confirm\('Web版の時間割・行動履歴・取り込みデータを復元します/);
 assert.match(html,/for\(const k of keys\)\{old\[k\]=localStorage\.getItem\(k\)/);
 assert.match(html,/localStorage\.setItem\(k\+'_BACKUP',old\[k\]\)/);
 assert.match(html,/if\(localStorage\.getItem\(keys\[i\]\)!==values\[i\]\)throw Error/);
 const old=a.normalizeTasks({items:[]});old.checkedAt='2026-01-01T00:00:00.000Z';
 assert.equal(a.validSaved(old,'tasks'),false);
 assert.equal(a.validSaved(old,'tasks',3650),true);
 const authArchive={schema:'yos-daystream-source-snapshot-v1',kind:'tasks',status:'partial',source:'yos-auth-cache',checkedAt:new Date(Date.now()-86400000).toISOString(),items:[]};
 assert.equal(a.validSaved(authArchive,'tasks'),false,'stale auth data is not live');
 assert.equal(a.validSaved(authArchive,'tasks',3650),false,'large retention alone does not bypass live-source freshness');
 assert.equal(a.validSaved(authArchive,'tasks',3650,true),true,'the full backup can restore archived source data');
 assert.match(html,/sourceAdapters\.validSaved\(v,kinds\[i\],3650,true\)/);

});

test('fresh existing authenticated YOS task cache is reused read-only but stale cache is refused',()=>{
 const task={title:'実行の確認',state:'次にやる',due:'2026-11-13',priority:'P1',order:4,nextAction:'次の一手',blocker:'NEVER_EXPOSE_BLOCKER'};
 const cache={savedAt:Date.now(),data:{tasks:[task]}};
 const snapshot=a.fromYosTaskDashboardCache(cache);
 assert.equal(snapshot.source,'yos-auth-cache');
 assert.equal(snapshot.status,'partial');
 assert.equal(snapshot.items[0].title,task.title);
 assert.equal(snapshot.items[0].action,task.nextAction);
 assert.equal(snapshot.items[0].blocker,undefined);
 assert.equal(a.fromYosTaskDashboardCache({...cache,savedAt:Date.now()-7*3600000}),null);
 const moved=a.fromYosTaskDashboardCache({savedAt:cache.savedAt,data:{tasks:[{...task,due:'2026-11-15'}]}});
 assert.equal(moved.items[0].id,snapshot.items[0].id,'due-date changes do not duplicate a planned task');
 assert.match(html,/yos-task-dashboard-cache-v1/);
 assert.match(html,/existingYosCache\|\|importedTasks/);
 assert.match(html,/YOS認証済みTasks写し/);
});

test('UTC ICS timestamps convert to Asia/Tokyo independent of browser timezone',()=>{
 const input=ICS([
  EV('utc-morning',':20261113T003000Z',':20261113T010000Z'),
  EV('utc-next-day',':20261113T153000Z',':20261113T160000Z')
 ]);
 const result=a.parseICS(input);
 assert.deepEqual(JSON.parse(JSON.stringify(result.calendarDays['2026-11-13'])),[{title:'Testing utc-morning',start:570,duration:30}]);
 assert.deepEqual(JSON.parse(JSON.stringify(result.calendarDays['2026-11-14'])),[{title:'Testing utc-next-day',start:30,duration:30}]);
 assert.equal(result.status,'ok');
});
test('Tokyo local TZID remains 09:30 for 09:30 wall time',()=>{
 const input=ICS([EV('tokyo-local',';TZID=Asia/Tokyo:20261113T093000',';TZID=Asia/Tokyo:20261113T100000')]);
 const result=a.parseICS(input);
 assert.equal(result.calendarDays['2026-11-13'][0].start,570);
 assert.equal(result.calendarDays['2026-11-13'][0].duration,30);
});
