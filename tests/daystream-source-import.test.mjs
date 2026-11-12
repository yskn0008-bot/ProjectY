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
 assert.match(html,/if\(saved&&x.done&&x.kind==='task'\)window\.YOS_DAYSTREAM_WEB\.logCompletion/);
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
});
