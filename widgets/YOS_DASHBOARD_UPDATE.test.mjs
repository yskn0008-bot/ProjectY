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
  assert.match(today,/addYosHealthStatus\(widget, health\)/);
  assert.equal((today.match(/addYosHealthStatus\(widget, health\)/g)||[]).length,1);
  assert.doesNotMatch(now,/addYosHealthStatus\(widget, health\)/);
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

test("health status reads only the existing local verified metadata, not new network data", () => {
  const snapshotCode=widgetSource.match(/function yosHealthSnapshot\(state, now\) \{[\s\S]*?\n\}/u)?.[0];
  const readerCode=widgetSource.match(/function yosHealthReadTodaySnapshot\(\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(snapshotCode&&readerCode);
  const day=value=>new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date(value));
  const snapshot=new Function('yosHealthDay',snapshotCode+';return yosHealthSnapshot;')(day);
  let reads=0;
  const fm={
    documentsDirectory:()=>'/docs',
    joinPath:(root,name)=>root+'/'+name,
    fileExists:()=>true,
    readString:()=>{reads++;return JSON.stringify({
      lastVerified:Date.now(),today:{day:day(Date.now()),meals:1,activities:0}
    });}
  };
  const keychain={contains:()=>true};
  const reader=new Function('Keychain','FileManager','YOS_HEALTH_TOKEN_KEY',
    'yosHealthSnapshot',readerCode+';return yosHealthReadTodaySnapshot;')(
      keychain,{local:()=>fm},'YOS_NOTION_INTEGRATION_TOKEN',snapshot);
  const value=reader();
  assert.equal(value.meals,1);
  assert.equal(value.activities,0);
  assert.equal(reads,1);
  const denied=new Function('Keychain','FileManager','YOS_HEALTH_TOKEN_KEY',
    'yosHealthSnapshot',readerCode+';return yosHealthReadTodaySnapshot;')(
      {contains:()=>false},{local:()=>fm},'YOS_NOTION_INTEGRATION_TOKEN',snapshot);
  assert.equal(denied(),null);
  assert.equal(reads,1,'no file is read without the existing token');
});

test("TODAY health line renders verified counts and unknown state using existing layout",()=>{
  const displayCode=widgetSource.match(/function addYosHealthStatus\(widget, verifiedHealth\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(displayCode);
  const render=(value)=>{
    const texts=[];
    const row={
      layoutHorizontally:()=>{},centerAlignContent:()=>{},addSpacer:()=>{},
      addText:(s)=>{texts.push(s);return {font:null,textColor:null,lineLimit:0,minimumScaleFactor:0};}
    };
    const widget={
      addStack:()=>row,
      addSpacer:()=>{},
      addText:(s)=>{texts.push(s);return {font:null,textColor:null,lineLimit:0,minimumScaleFactor:0};}
    };
    const f=new Function('yosHealthReadTodaySnapshot','addSymbol','font','color','COLORS',
      displayCode+';return addYosHealthStatus;')(
        ()=>value,()=>{},(size)=>({size}),(name)=>name,
        {coral:'#A00',muted:'#777',text:'#111',faint:'#999'}
      );
    f(widget);
    return texts;
  };
  assert.deepEqual(render({day:'2026-11-01',meals:1,activities:0}),[
    '健康記録','食事 1件 · 運動 未報告','次 → 体調がよければ5分歩く'
  ]);
  assert.deepEqual(render({day:'2026-11-01',meals:0,activities:1}),[
    '健康記録','食事 未報告 · 運動 1件','次 → 水分補給と休息も意識'
  ]);
  assert.deepEqual(render({day:'2026-11-01',meals:0,activities:0}),[
    '健康記録','食事 未報告 · 運動 未報告','次 → 体調がよければ5分歩く'
  ]);
  assert.deepEqual(render(null),['健康記録','同期の確認待ち']);
  assert.deepEqual(render({noteOnly:true,meals:null,activities:null}),['健康記録','記録あり · 件数未確認']);
});

test("money.json amount is hidden until explicitly confirmed with a five-minute timestamp",()=>{
  const code=widgetSource.slice(widgetSource.indexOf("function yosMoneyVerifiedAmount("),
    widgetSource.indexOf("\nasync function loadMoney()"));
  assert.ok(code.includes('function yosMoneyVerifiedAmount('));
  const validate=new Function(code+';return yosMoneyVerifiedAmount;')();
  const now=Date.parse('2026-11-01T12:00:00.000Z');
  const record=(amount,confirmed,confirmedAt)=>({balance:{amount,confirmed,confirmedAt}});
  assert.equal(validate({balance:{amount:128}},now),null);
  assert.equal(validate(record(128,false,'2026-11-01T11:59:00.000Z'),now),null);
  assert.equal(validate(record(128,true,'2026-10-31T12:00:00.000Z'),now),null);
  assert.equal(validate(record(128,true,'2026-11-01T12:01:00.000Z'),now),null);
  assert.equal(validate(record(128,true,'2026-11-01T11:59:00'),now),null);
  assert.equal(validate(record('128',true,'2026-11-01T11:59:00.000Z'),now),null);
  assert.equal(validate(record(-1,true,'2026-11-01T11:59:00.000Z'),now),null);
  assert.equal(validate(record(0,true,'2026-11-01T11:59:00.000Z'),now),0);
  assert.equal(validate(record(128,true,'2026-11-01T11:59:00.000Z'),now),128);
  assert.match(widgetSource,/money\.available \? yen\(money\.amount\) : "要確認"/);
  assert.match(widgetSource,/money\.available \? yen\(money\.amount\) : "残高未確認"/);
});

test("existing verified Notion journal yields accurate count even when local cache lacks today",()=>{
  const start=widgetSource.indexOf('function yosHealthSnapshotFromJournal(');
  const end=widgetSource.indexOf('\nasync function yosHealthLatestSnapshot()',start);
  const helper=widgetSource.slice(start,end);
  assert.ok(start>0 && end>start);
  const classifiers=widgetSource.slice(widgetSource.indexOf('const YOS_HEALTH_EAT = '),
    widgetSource.indexOf('function yosHealthDay('));
  assert.ok(classifiers.includes('function yosHealthClassify('));
  const classify=new Function(classifiers+';return yosHealthClassify;')();
  const tokyoDay=value=>new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date(value));
  const parse=new Function('yosHealthClassify','yosHealthDay',
    helper+';return yosHealthSnapshotFromJournal;')(classify,tokyoDay);
  const now=Date.parse('2026-11-01T11:30:00Z');
  const manual='【本人申告】午前1時ごろ、豚汁とチキン南蛮弁当をほっともっとで買って食べた。Clarity報告ID: clarity:324672-a1';
  assert.deepEqual(parse(manual,'2026-11-01',now),{
    day:'2026-11-01',meals:1,activities:0,verifiedAt:now
  });
  const both='[YOS-health:clarity:123456-a1:meal]\n'+
             '[YOS-health:clarity:123456-a1:meal]\n'+
             '[YOS-health:clarity:234567-b2:activity]';
  const result=parse(both,'2026-11-01',now);
  assert.equal(result.meals,1);
  assert.equal(result.activities,1);
  assert.equal(parse(manual,'2026-10-31',now),null);
  assert.equal(parse('今後は野菜を食べたい','2026-11-01',now).noteOnly,true);
  assert.equal(parse('','2026-11-01',now),null);
});

test("TODAY read-only fallback queries only the existing verified daily journal",async()=>{
  const match=widgetSource.match(/async function yosHealthLatestSnapshot\(\) \{[\s\S]*?\n\}/u);
  assert.ok(match);
  let queried=0;
  const mockJournal={
    properties:{'本文':{rich_text:[{plain_text:'【本人申告】豚汁を食べた。Clarity報告ID: clarity:324672-a1'}]}}
  };
  const loader=new (Object.getPrototypeOf(async function(){}).constructor)(
    'yosHealthReadTodaySnapshot','Keychain','YOS_HEALTH_TOKEN_KEY','yosHealthDay',
    'yosHealthExisting','yosHealthValue','yosHealthSnapshotFromJournal',
    match[0]+';return yosHealthLatestSnapshot;'
  )(
    ()=>null,{contains:()=>true,get:()=> 'private-token'},'YOS_NOTION_INTEGRATION_TOKEN',
    ()=> '2026-11-01',
    async()=>{queried++;return mockJournal;},
    xs=>xs.map(x=>x.plain_text).join(''),
    (body,day)=>({day,meals:1,activities:0,verifiedAt:1})
  );
  const run=await loader;
  assert.equal((await run()).meals,1);
  assert.equal(queried,1);
  assert.match(widgetSource,/PARAM==="TODAY" \? yosHealthLatestSnapshot\(\) : Promise.resolve\(null\)/);
  assert.match(widgetSource,/if\(!entry\)return fallback/);
  assert.match(widgetSource,/yosHealthExisting\(token,day\)/);
  assert.doesNotMatch(match[0],/POST|'\/pages'/);
});


test("TODAY refreshes a stale positive cache against real YOS Diary without writing",async()=>{
  const fn=widgetSource.match(/async function yosHealthLatestSnapshot\(\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(fn);
  let queries=0;
  const cached={day:'2026-11-02',meals:1,activities:0,verifiedAt:Date.now()-20*60*1000};
  const run=new (Object.getPrototypeOf(async function(){}).constructor)(
    'yosHealthReadTodaySnapshot','Keychain','YOS_HEALTH_TOKEN_KEY','yosHealthDay',
    'yosHealthExisting','yosHealthValue','yosHealthSnapshotFromJournal',
    fn+';return yosHealthLatestSnapshot;'
  )(()=>cached,{contains:()=>true,get:()=> 'local-token'},'YOS_NOTION_INTEGRATION_TOKEN',
     ()=> '2026-11-02',
     async()=>{queries++;return {properties:{'本文':{rich_text:[{plain_text:'[YOS-health:clarity:walk-1:activity]'}]}}};},
     xs=>xs.map(x=>x.plain_text).join(''),
     ()=>({day:'2026-11-02',meals:1,activities:1,verifiedAt:Date.now()}));
  const value=await (await run)();
  assert.equal(queries,1);
  assert.equal(value.activities,1);
  assert.doesNotMatch(fn,/\/pages\/|\.method\s*=\s*['"]PATCH/);
});
test("TODAY avoids extra Notion reads for a verified recent cache",async()=>{
  const fn=widgetSource.match(/async function yosHealthLatestSnapshot\(\) \{[\s\S]*?\n\}/u)?.[0];
  let queries=0;
  const cached={day:'2026-11-02',meals:1,activities:0,verifiedAt:Date.now()-2*60*1000};
  const run=new (Object.getPrototypeOf(async function(){}).constructor)(
    'yosHealthReadTodaySnapshot','Keychain','YOS_HEALTH_TOKEN_KEY','yosHealthDay',
    'yosHealthExisting','yosHealthValue','yosHealthSnapshotFromJournal',
    fn+';return yosHealthLatestSnapshot;'
  )(()=>cached,{contains:()=>true,get:()=> 'local-token'},'YOS_NOTION_INTEGRATION_TOKEN',
     ()=> '2026-11-02',async()=>{queries++;throw Error('unexpected query')},
     ()=>'',()=>null);
  assert.deepEqual(await (await run)(),cached);
  assert.equal(queries,0);
});
test("TODAY never treats an hours-old cache as confirmed if Notion is unavailable",async()=>{
  const fn=widgetSource.match(/async function yosHealthLatestSnapshot\(\) \{[\s\S]*?\n\}/u)?.[0];
  const reader=new (Object.getPrototypeOf(async function(){}).constructor)(
    'yosHealthReadTodaySnapshot','Keychain','YOS_HEALTH_TOKEN_KEY','yosHealthDay',
    'yosHealthExisting','yosHealthValue','yosHealthSnapshotFromJournal',
    fn+';return yosHealthLatestSnapshot;'
  );
  const run=await reader(
    ()=>({day:'2026-11-02',meals:1,activities:0,verifiedAt:Date.now()-2*60*60*1000}),
    {contains:()=>true,get:()=> 'local-token'},'YOS_NOTION_INTEGRATION_TOKEN',
    ()=> '2026-11-02',async()=>{throw Error('offline');},()=>'',()=>null
  );
  assert.equal(await run(),null);
});
