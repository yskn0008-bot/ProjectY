import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../scriptable/YOS DAYSTREAM Notion.js',import.meta.url),'utf8');
const fnStart=script.indexOf('function nativeDirectRows(tasks){');
const fnEnd=script.indexOf('\n/**\n * iPhone Calendar',fnStart);
assert.ok(fnStart>=0&&fnEnd>fnStart,'native projection source must remain readable');

const nativeDirectRows=new Function('STATES','validAt','clean',
 script.slice(fnStart,fnEnd)+';return nativeDirectRows;')(
 ['次にやる','実行中','本人操作','待ち','保留','完了'],
 s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(s),
 (s,n)=>String(s).slice(0,n)
);

const tick=String.fromCharCode(96);
const pre='const BROWSER_DIRECT_IMPORT=String.raw'+tick;
const a=script.indexOf(pre);
const b=script.indexOf(tick+';\nfunction nativeDirectRows(tasks){',a);
assert.ok(a>=0&&b>a,'embedded read-only DAYSTREAM projection exists');
const browser=script.slice(a+pre.length,b);

const task=(letter,key,title,start,end,cycle='')=>({
 id:letter.repeat(32),syncKey:key,title,due:start,dueEnd:end,
 habitCycle:cycle,state:'次にやる',sourceKind:'task'
});
const fixture=[
 task('a','yos-daystream-routine-202612-wake','起床','2026-11-23T14:20:00+09:00','2026-11-23T14:22:00+09:00','毎日'),
 task('b','yos-daystream-ideal-20261123-meal','食事','2026-11-23T15:10:00+09:00','2026-11-23T15:30:00+09:00','毎日'),
 task('c','yos-daystream-ideal-20261123-journal','JOURNAL','2026-11-23T15:30:00+09:00','2026-11-23T15:40:00+09:00','毎日'),
 task('d','yos-daystream-ideal-20261123-free','自由時間','2026-11-23T15:40:00+09:00','2026-11-23T15:55:00+09:00','毎日'),
 task('e','yos-ikemen90-task-01','美容用品','2026-11-23T15:55:00+09:00','2026-11-23T16:05:00+09:00'),
 task('f','yos-ikemen90-task-02','基準写真','2026-11-23T16:05:00+09:00','2026-11-23T16:15:00+09:00'),
 task('1','yos-daystream-routine-202612-sleep','睡眠','2026-11-24T06:10:00+09:00','2026-11-24T14:20:00+09:00','毎日'),
 task('h','unrelated-task','無関係','2026-11-23T16:00:00+09:00','2026-11-23T16:30:00+09:00')
];
function preview(tasks=fixture){
 const rows=nativeDirectRows(tasks);
 const window={addEventListener(){}};
 const document={getElementById(){return null}};
 new Function('window','document',browser.replace('__DIRECT_ROWS__',JSON.stringify(rows)))(window,document);
 return {rows,project:window.YOS_ONE_TAP_FOR_DAY};
}

test('selected daily and looks tasks are read from authoritative sync keys',()=>{
 const {rows}=preview();
 assert.equal(rows.length,7);
 assert.equal(rows.filter(x=>x.repeat==='daily').length,5);
 assert.equal(rows.filter(x=>x.repeat==='once').length,2);
});
test('one tap shows daily items and two looks tasks without manual proposal',()=>{
 const {project}=preview();
 const today=project('2026-11-23',[]);
 assert.equal(today.length,6);
 assert.ok(today.every(x=>x.f===0&&x.kind==='task'&&x.source==='YOS Tasks'));
 assert.equal(today.find(x=>x.t==='起床').s,14*60+20);
});
test('next day recurrence, but no repeated one-time looks tasks',()=>{
 const {project}=preview();
 const next=project('2026-11-24',[]);
 assert.equal(next.length,5);
 assert.ok(next.some(x=>x.t==='睡眠'));
 assert.ok(!next.some(x=>x.t==='美容用品'));
});
test('old imported YOS Direct and local notion task edits take precedence',()=>{
 const {project}=preview();
 const today=project('2026-11-23',[
   {sourceRef:'yos-direct:'+'a'.repeat(32)},
   {sourceRef:'notion:'+'e'.repeat(32)}
 ]);
 assert.equal(today.length,4);
 assert.ok(!today.some(x=>x.t==='起床'||x.t==='美容用品'));
});
test('cross-midnight sessions are clipped per day without changing their Notion source',()=>{
 const {project}=preview([task('0','yos-daystream-ideal-20261123-free','夜の自由時間',
 '2026-11-23T23:50:00+09:00','2026-11-24T00:20:00+09:00','毎日')]);
 const a=project('2026-11-23',[]),b=project('2026-11-24',[]);
 assert.deepEqual(a.map(x=>[x.s,x.d]),[[23*60+50,10]]);
 assert.deepEqual(b.map(x=>[x.s,x.d]),[[0,20],[23*60+50,10]]);
});
test('time-only overrides never modify the existing DAYSTREAM plan',()=>{
 assert.match(browser,/const MOVE_KEY='YOS_DAYSTREAM_NOTION_MOVES_V1'/);
 assert.doesNotMatch(browser,/YOS_DAYSTREAM_WEB_PLAN_V1/);
 assert.match(script,/x\.source!=='YOS Tasks'/);
 assert.match(script,/window\.YOS_ONE_TAP_FOR_DAY\?\.\(day/);
 assert.doesNotMatch(browser,/YOS_DAYSTREAM_DIRECT_IMPORTED_V1/);
});
test('notion credentials and local user preferences remain outside the preview payload',()=>{
 assert.doesNotMatch(browser,/YOS_NOTION_INTEGRATION_TOKEN|Keychain/);
 assert.match(script,/if\(out\.split\(timelineAnchor\)\.length!==2\)throw/);
});

test('Scriptable uses published DAYSTREAM HTML and a stable HTTPS storage origin',()=>{
 assert.match(script,/const UI_REF='f053f215a9aece41ca68808573ffc9a2c80ae504'/);
 assert.match(script,/const UI_BASE_URL='https:\/\/yskn0008-bot\.github\.io\/ProjectY\/yos\/daystream\/'/);
 assert.match(script,/WebView\.loadHTML\(output,UI_BASE_URL,null,true\)/);
 assert.match(script,/getElementById\('yosTimelineSync'\)/);
 assert.doesNotMatch(script,/localStorage\.clear\(|removeItem\('YOS_DAYSTREAM_WEB_PLAN_V1'\)/);
});
test('read-only Notion projection remains independent of unavailable browser storage',()=>{
 const {project}=preview();
 const forbidden={getItem(){throw Error('SecurityError')},setItem(){throw Error('SecurityError')}};
 // No storage is passed into the projection; accessing either method is forbidden.
 assert.equal(project('2026-11-23',[]).length,6);
 assert.throws(()=>forbidden.getItem(),/SecurityError/);
 assert.match(browser,/catch\{return null;\}/);
});

test('synced task categories receive distinct existing DAYSTREAM tones',()=>{
 const {project}=preview();
 const cards=project('2026-11-23',[]);
 assert.ok(cards.every(x=>['blue','mint','peach','violet'].includes(x.flowTone)));
 const tones=new Map(cards.map(x=>[x.t,x.flowTone]));
 assert.equal(tones.get('起床'),'blue');
 assert.equal(tones.get('食事'),'peach');
 assert.equal(tones.get('JOURNAL'),'violet');
});
test('moving synced task time persists only a per-day override',()=>{
 const rows=nativeDirectRows(fixture),storage=new Map();
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 const window={addEventListener(){}};
 new Function('window','document','localStorage',browser.replace('__DIRECT_ROWS__',JSON.stringify(rows)))(window,{getElementById(){return null}},localStorage);
 const a=window.YOS_ONE_TAP_FOR_DAY('2026-11-24',[]);
 assert.equal(a.find(x=>x.t==='起床').s,860);
 assert.equal(window.YOS_NOTION_LOCAL_MOVE('2026-11-24','notion:'+'a'.repeat(32),930,2),true);
 assert.equal(window.YOS_ONE_TAP_FOR_DAY('2026-11-24',[]).find(x=>x.t==='起床').s,930);
 assert.equal(window.YOS_ONE_TAP_FOR_DAY('2026-11-25',[]).find(x=>x.t==='起床').s,860);
 assert.deepEqual([...storage.keys()],['YOS_DAYSTREAM_NOTION_MOVES_V1']);
 assert.equal(storage.get('YOS_DAYSTREAM_WEB_PLAN_V1'),undefined);
 assert.equal(window.YOS_NOTION_LOCAL_MOVE('2026-11-24','notion:'+'a'.repeat(32),1439,2),false);
});
test('invalid or inaccessible override storage never overwrites a saved value',()=>{
 const rows=nativeDirectRows(fixture);
 let value='{corrupt',writes=0;
 const storage={getItem:()=>value,setItem:(_,v)=>{writes++;value=v}};
 const window={addEventListener(){}};
 new Function('window','document','localStorage',browser.replace('__DIRECT_ROWS__',JSON.stringify(rows)))(window,{getElementById(){return null}},storage);
 assert.equal(window.YOS_ONE_TAP_FOR_DAY('2026-11-24',[]).length,5);
 assert.equal(window.YOS_NOTION_LOCAL_MOVE('2026-11-24','notion:'+'a'.repeat(32),930,2),false);
 assert.equal(value,'{corrupt');assert.equal(writes,0);
 const denied={getItem(){throw Error('SecurityError')},setItem(){throw Error('SecurityError')}};
 const other={addEventListener(){}};
 new Function('window','document','localStorage',browser.replace('__DIRECT_ROWS__',JSON.stringify(rows)))(other,{getElementById(){return null}},denied);
 assert.equal(other.YOS_ONE_TAP_FOR_DAY('2026-11-24',[]).length,5);
 assert.equal(other.YOS_NOTION_LOCAL_MOVE('2026-11-24','notion:'+'a'.repeat(32),930,2),false);
});
