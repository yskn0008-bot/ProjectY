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
 assert.ok(today.every(x=>x.f===1&&x.source==='YOS Tasks'));
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
test('never write preview rows to local storage or bypass corrupt-save protection',()=>{
 assert.doesNotMatch(browser,/localStorage\s*[.(]/);
 assert.match(script,/x\.source!=='YOS Tasks'/);
 assert.match(script,/window\.YOS_ONE_TAP_FOR_DAY\?\.\(day/);
 assert.doesNotMatch(browser,/YOS_DAYSTREAM_DIRECT_IMPORTED_V1/);
});
test('notion credentials and local user preferences remain outside the preview payload',()=>{
 assert.doesNotMatch(browser,/YOS_NOTION_INTEGRATION_TOKEN|Keychain/);
 assert.match(script,/if\(out\.split\(timelineAnchor\)\.length!==2\)throw/);
});
