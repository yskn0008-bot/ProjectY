import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./YOS_DASHBOARD_UPDATE.js", import.meta.url), "utf8");
const widgetSource = fs.readFileSync(new URL("./YOS_DASHBOARD_WIDGET_v1.js", import.meta.url), "utf8");

test("updater resolves main SHA before downloading immutable widget source", () => {
  assert.match(source, /\/branches\/main/);
  assert.match(source, /branch\?\.commit\?\.sha/);
  assert.match(source, /raw\.githubusercontent\.com/);
  assert.match(source, /sha \+/);
});

test("updater targets YOS Dashboard v2 and verifies stable dashboard capabilities", () => {
  assert.match(source, /YOS Dashboard v2\.js/);
  assert.match(source, /source\.length < 5000/);
  assert.match(source, /\/\/ YOS Dashboard Widget v1/);
  assert.match(source, /args\.widgetParameter/);
  assert.match(source, /function makeNow\(/);
  assert.match(source, /function makeToday\(/);
  assert.match(source, /loadTaskFeed\(\)/);
  assert.match(source, /CalendarEvent\.today\(\)/);
  assert.match(source, /YOS\/Money\/money\.json/);
  assert.match(source, /shortcuts:\/\/run-shortcut\?name=/);
  assert.match(source, /manager\.readString\(path\)/);
  assert.match(source, /saved !== source/);
});

test("updater validation does not depend on a specific task-rendering implementation", () => {
  assert.doesNotMatch(source, /const text = parent\.addText\(task\.title/);
  assert.doesNotMatch(source, /const dot = row\.addStack\(\)/);
  assert.doesNotMatch(source, /titleNeedsTwoLines/);
});

test("dashboard updater never removes the installed direct Notion health bridge", () => {
  assert.match(source, /YOS_HEALTH_LOCAL_BRIDGE_V1/);
  assert.match(source, /validateSource\(source\)/);
  assert.match(source, /for \(const marker of required\)/);
});

test("official Dashboard includes the existing verified iPhone health sync exactly once", () => {
  assert.equal((widgetSource.match(/YOS_HEALTH_LOCAL_BRIDGE_V1/g) || []).length, 1);
  assert.match(widgetSource, /const YOS_HEALTH_EXISTING_INBOX_ID/);
  assert.match(widgetSource, /const YOS_HEALTH_EXISTING_DIARY_ID/);
  assert.match(widgetSource, /const YOS_HEALTH_TOKEN_KEY/);
  assert.match(widgetSource, /function yosHealthClassify\(/);
  assert.match(widgetSource, /function yosHealthExtract\(/);
  assert.match(widgetSource, /function yosHealthMerge\(/);
  assert.match(widgetSource, /async function yosHealthRunOnce\(/);
  assert.equal((widgetSource.match(/try \{ await yosHealthRunOnce\(\); \} catch \(_\) \{\}/g)||[]).length, 2);
  assert.equal((widgetSource.match(/Script\.complete\(\);/g)||[]).length, 3);
  assert.match(widgetSource, /Script\.setWidget\(widget\)/);
  assert.match(widgetSource, /function makeToday\(/);
  assert.match(widgetSource, /function makeNow\(/);
});

test("health sync uses only existing Notion resources and never persists unverified claims", () => {
  assert.match(widgetSource, /'YOS_NOTION_INTEGRATION_TOKEN'/);
  assert.match(widgetSource, /'health:'\+day/);
  assert.match(widgetSource, /Clarity報告ID:/);
  assert.match(widgetSource, /readback mismatch/);
  assert.match(widgetSource, /health journal duplicate/);
  assert.match(widgetSource, /Keychain\.contains\(YOS_HEALTH_TOKEN_KEY\)/);
  assert.doesNotMatch(widgetSource, /\bScriptable\.open\(/);
});

test("TODAY shows only recent, verified reports and does not infer missing exercise", () => {
  const match=widgetSource.match(/function yosHealthSnapshot\(state, now\) \{[\s\S]*?\n\}/u);
  assert.ok(match, "snapshot function exists");
  const day=(value)=>new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date(value));
  const snapshot=new Function('yosHealthDay',match[0]+';return yosHealthSnapshot;')(day);
  const now=Date.parse('2026-11-01T07:00:00.000Z');
  const record={lastVerified:now-120000,today:{day:'2026-11-01',meals:1,activities:0}};
  assert.deepEqual(snapshot(record,now),{
    day:'2026-11-01',meals:1,activities:0,verifiedAt:now-120000
  });
  assert.equal(snapshot({},now),null);
  assert.equal(snapshot({today:record.today},now),null);
  assert.equal(snapshot({...record,today:{...record.today,day:'2026-10-31'}},now),null);
  assert.equal(snapshot({...record,lastVerified:now-13*60*60*1000},now),null);
  assert.equal(snapshot({...record,lastVerified:now+120000},now),null);
  assert.equal(snapshot({...record,today:{...record.today,meals:-1}},now),null);
  assert.equal(snapshot({...record,today:{...record.today,activities:1.5}},now),null);
  assert.equal(snapshot({...record,today:{...record.today,meals:41}},now),null);
});

test("TODAY retains existing calendars, tasks, routines and money beside one compact health row", () => {
  const today=widgetSource.slice(widgetSource.indexOf('function makeToday('),
    widgetSource.indexOf('\nasync function promptToken('));
  const now=widgetSource.slice(widgetSource.indexOf('function makeNow('),
    widgetSource.indexOf('\n// Display only counts'));
  assert.match(today,/addYosHealthStatus\(widget\)/);
  assert.equal((today.match(/addYosHealthStatus\(widget\)/g)||[]).length,1);
  assert.doesNotMatch(now,/addYosHealthStatus\(widget\)/);
  for(const phrase of ['addEventLine(widget, event)','addTaskLine(widget, task, false)',
    'addRoutineButton(routines, "Morning"','addRoutineButton(routines, "Night"',
    'const moneyRow = widget.addStack()']){
    assert.ok(today.includes(phrase),'existing TODAY section retained: '+phrase);
  }
  assert.match(widgetSource,/state\.activities \? state\.activities\+'件' : '未報告'/);
  assert.match(widgetSource,/同期の確認待ち/);
});

test("health counts cache only verified same-day Inbox reports, without storing raw meal content", () => {
  const run=widgetSource.slice(widgetSource.indexOf('async function yosHealthRunOnce()'),
    widgetSource.indexOf('\nif (ACTION === "baseHome"'));
  const loop=run.indexOf('await yosHealthWrite(token,day,events)');
  const verified=run.indexOf('const confirmedToday=hits.filter');
  const write=run.indexOf('lastVerified:Date.now()');
  assert.ok(loop>=0 && verified>loop && write>verified);
  assert.match(run,/hit\.kind==='meal'/);
  assert.match(run,/hit\.kind==='activity'/);
  assert.match(run,/today:snapshot/);
  assert.doesNotMatch(run,/JSON\.stringify\(\{[^}]*raw:/);
  assert.match(widgetSource,/if\(!Keychain\.contains\(YOS_HEALTH_TOKEN_KEY\)\)return null/);
});
