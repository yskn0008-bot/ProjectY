import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The iPhone user is in Japan; CI runners default to UTC.
process.env.TZ='Asia/Tokyo';
const script=readFileSync(new URL('../scriptable/YOS DAYSTREAM Notion.js',import.meta.url),'utf8');
const begin=script.indexOf('// PRIVATE DAYSTREAM XL:');
const end=script.indexOf('\nconst safeScript=',begin);
assert.ok(begin>=0&&end>begin,'private XL helper exists');
const code=script.slice(begin,end);
const captures=[],written=new Map();
class MockDrawContext {
 set size(v){this._size=v}get size(){return this._size}
 set respectScreenScale(v){}set opaque(v){}
 setFillColor(){}fillRect(){}setFont(){}setTextColor(){}
 drawTextInRect(s){captures.push(s)}
 getImage(){return {mock:true}}
}
class MockColor{constructor(value){this.value=value}}
class MockRect{constructor(x,y,w,h){Object.assign(this,{x,y,w,h})}}
class MockSize{constructor(w,h){Object.assign(this,{w,h})}}
const mockFile={
 documentsDirectory:()=>'/icloud/Scriptable',
 joinPath:(...s)=>s.join('/'),
 fileExists:p=>written.has(p),
 createDirectory:p=>written.set(p,'dir'),
 writeImage:(p,img)=>written.set(p,img),
 writeString:(p,s)=>written.set(p,s),
 readString:p=>written.get(p),
 copy:(a,b)=>written.set(b,written.get(a)),
 remove:p=>written.delete(p),
};
const api=new Function('DrawContext','FileManager','Color','Rect','Size','Font',
 code+'; return {yosXlRows,yosXlImage,yosXlExport,yosXlReadMoves}')(MockDrawContext,{iCloud:()=>mockFile},MockColor,MockRect,MockSize,
 {semiboldSystemFont:n=>n,regularSystemFont:n=>n});
const now=new Date('2026-11-24T12:00:00+09:00');
const t=(title,start,end,repeat='daily',done=false)=>({title,startAt:start,endAt:end,repeat,done});
test('repeating overnight habit is safely split at local midnight',()=>{
 const rows=api.yosXlRows([t('夜の読書','2026-11-23T23:50:00+09:00','2026-11-24T00:20:00+09:00')],null,now).rows;
 assert.deepEqual(rows.map(x=>[x.minute,x.duration]),[[0,20],[1430,10]]);
});
test('one time LOOKS task never repeats outside its original day',()=>{
 const one=t('基準写真','2026-11-23T15:00:00+09:00','2026-11-23T15:10:00+09:00','once');
 const other=t('保湿','2026-11-23T16:00:00+09:00','2026-11-23T16:10:00+09:00');
 const p=api.yosXlRows([one,other],null,now);
 assert.deepEqual(p.rows.map(x=>x.title),['保湿']);
 assert.equal(p.calendarConfirmed,false);
});
test('Apple events and tasks are unified in one sorted list, not separate panels',()=>{
 const day='2026-11-24';
 const calendar={status:'ok',calendarDays:{[day]:[{title:'夜勤',start:18*60,duration:300}]}};
 const p=api.yosXlRows([t('食事','2026-11-23T17:00:00+09:00','2026-11-23T17:30:00+09:00')],calendar,now);
 assert.deepEqual(p.rows.map(x=>x.title),['食事','夜勤']);
 assert.equal(p.calendarConfirmed,true);
 assert.deepEqual(p.rows.map(x=>x.source),['habit','calendar']);
});
test('same title and time is de-duplicated within the XL preview',()=>{
 const day='2026-11-24';
 const p=api.yosXlRows([t('買い物','2026-11-23T18:00:00+09:00','2026-11-23T18:20:00+09:00')],
  {calendarDays:{[day]:[{title:'買い物',start:1080,duration:20}]},status:'ok'},now);
 assert.equal(p.rows.length,1);
});
test('XL renderer only exports a private generated image after a valid projection',()=>{
 captures.length=0;written.clear();
 const input=[t('JOURNAL','2026-11-23T15:30:00+09:00','2026-11-23T15:40:00+09:00')];
 const result=api.yosXlExport(input,{status:'unavailable',calendarDays:{}});
 assert.equal(result.ok,true);
 assert.match(result.path,/\/YOS_Widgets\/YOS_DAYSTREAM_XL.png$/);
 assert.ok(written.has(result.path));
 assert.equal(written.get(result.path.replace('.png','.owner.txt')),'YOS DAYSTREAM XL generated image v1');
 assert.ok(captures.some(x=>x.includes('今日のタイムライン')));
 assert.doesNotMatch(JSON.stringify(written),/YOS_NOTION_INTEGRATION_TOKEN|Bearer/);
});
test('unknown same-name image and orphaned receipt are preserved',()=>{
 written.clear();
 const path='/icloud/Scriptable/YOS_Widgets/YOS_DAYSTREAM_XL.png';
 written.set(path,{personal:true});
 assert.throws(()=>api.yosXlExport([],null),/既存の同名画像を保護/);
 assert.deepEqual(written.get(path),{personal:true});
 written.delete(path);
 written.set(path.replace('.png','.owner.txt'),'YOS DAYSTREAM XL generated image v1');
 assert.throws(()=>api.yosXlExport([],null),/管理記録が一致しません/);
 assert.equal(written.has(path),false);
});
test('previous generated image is restored after a failed replacement',()=>{
 written.clear();
 const first=api.yosXlExport([],null),old=written.get(first.path);
 const normal=mockFile.writeImage;
 mockFile.writeImage=(p,img)=>{written.set(p,img);throw Error('disk full')};
 try{assert.throws(()=>api.yosXlExport([],null),/disk full/)}
 finally{mockFile.writeImage=normal}
 assert.equal(written.get(first.path),old);
 assert.equal(written.has(first.path.replace('.png','.previous.png')),false);
});
test('daily task is not shown before its first source day; fictional events stay hidden',()=>{
 const earlier=new Date('2026-11-22T12:00:00+09:00');
 assert.deepEqual(api.yosXlRows([t('新しい習慣','2026-11-23T16:00:00+09:00','2026-11-23T16:30:00+09:00')],null,earlier).rows,[]);
 const p=api.yosXlRows([],{allDayDays:{'2026-11-24':['YOS-TEST-fixture','本当の予定']}},now);
 assert.deepEqual(p.rows.map(x=>x.title),['本当の予定']);
});
test('verified per-day move changes the rendered image without modifying the source task',()=>{
 const id='a'.repeat(32),task={...t('起床','2026-11-23T14:20:00+09:00','2026-11-23T14:50:00+09:00'),id};
 const move={['2026-11-24|notion:'+id]:930};
 const p=api.yosXlRows([task],null,now,move);
 assert.equal(p.localMovesConfirmed,true);
 assert.equal(p.localMovesApplied,true);
 assert.equal(p.rows[0].minute,930);
 assert.equal(task.startAt,'2026-11-23T14:20:00+09:00');
 captures.length=0;api.yosXlImage(p);
 assert.ok(captures.some(x=>x.includes('端末内移動反映')));
});
test('invalid or unreadable move storage stays at Notion time and is labeled',async()=>{
 const id='b'.repeat(32),task={...t('食事','2026-11-23T17:00:00+09:00','2026-11-23T17:30:00+09:00'),id};
 const bad={['2026-11-24|notion:'+id]:1430};
 const p=api.yosXlRows([task],null,now,bad);
 assert.equal(p.rows[0].minute,1020);
 assert.equal(p.localMovesApplied,false);
 assert.equal((await api.yosXlReadMoves({evaluateJavaScript:async s=>{
  assert.equal(s,"localStorage.getItem('YOS_DAYSTREAM_NOTION_MOVES_V1')");return JSON.stringify(bad);
 }}))['2026-11-24|notion:'+id],1430);
 assert.equal(await api.yosXlReadMoves({evaluateJavaScript:async()=>{throw Error('storage denied')}}),null);
 assert.equal(api.yosXlRows([task],null,now,null).localMovesConfirmed,false);
 captures.length=0;api.yosXlImage(api.yosXlRows([task],null,now,null));
 assert.ok(captures.some(x=>x.includes('移動未反映')));
});
test('app WebView reads only existing move storage; Siri retains original presentation route',()=>{
 assert.match(script,/const view=new WebView\(\);await view\.loadHTML\(output,UI_BASE_URL\)/);
 assert.match(script,/const moves=await yosXlReadMoves\(view\)/);
 assert.match(script,/await view\.present\(true\)/);
 assert.match(script,/const finalMoves=await yosXlReadMoves\(view\)/);
 assert.match(script,/if\(finalMoves!==null\)try\{yosXlExport\(directRows,deviceCalendar,finalMoves\)\}/);
 assert.match(script,/await WebView\.loadHTML\(output,UI_BASE_URL,null,true\)/);
 assert.doesNotMatch(code,/localStorage\.setItem|localStorage\.removeItem/);
});
test('fails without platform APIs without altering existing plan or network',()=>{
 const noPlatform=new Function(code+';return yosXlExport;')();
 assert.deepEqual(noPlatform([],null),{ok:false,reason:'画像API未対応'});
 assert.doesNotMatch(code,/fetch\(|https?:\/\/|localStorage\.setItem|api\.notion\.com/);
 assert.match(script,/const output=buildHTML\(html,adapters,native,wizard,snapshot,directRows,deviceCalendar,deviceCalendarStatus\)/);
});
