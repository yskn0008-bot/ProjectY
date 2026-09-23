import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=await readFile(new URL('../calendar-sync-scriptable.js',import.meta.url),'utf8');
const importer=html.slice(html.indexOf('function importPayload('),html.indexOf('function importFromUrl('));
test('Scriptable all-day flag survives URL serialization, import and persistence',async()=>{
 let url;const sample=[true,false].map((isAllDay,i)=>({identifier:String(i),title:'予定🌞',startDate:new Date('2026-09-20T00:00:00+09:00'),endDate:new Date('2026-09-21T00:00:00+09:00'),isAllDay}));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('CalendarEvent','Data','Safari','Script','Alert',source)(
 {today:async()=>sample},{fromString:s=>({toBase64String:()=>Buffer.from(s).toString('base64')})},
 {open:s=>{url=s}},{complete(){}},class{constructor(){throw Error('unexpected error')}});
 const payload=JSON.parse(Buffer.from(new URL(url).searchParams.get('sync'),'base64url').toString());
 const data={schedule:[],tasks:[]};let saved;
 vm.runInNewContext(importer+';importPayload(payload)',{payload,day:()=>data,today:()=>payload.date,categoryOf:()=> 'other',COLORS:{other:'#aaa'},KEY:'life',data,paint(){},localStorage:{setItem(k,v){saved=JSON.parse(v)}}});
 assert.deepEqual(saved.schedule.map(e=>e.isAllDay),[true,false]);
 assert.equal(saved.schedule[0].title,'予定🌞');
});
test('detail renders all-day label without midnight times; timed midnight stays timed',()=>{
 const render=html.slice(html.indexOf('function renderSchedule('),html.indexOf('\nfunction ',html.indexOf('function renderSchedule(')+10));
 for(const isAllDay of [true,false]){
  const rows=[];const box={innerHTML:'',appendChild:r=>rows.push(r)};
  const ctx={day:()=>({schedule:[{title:'予定',start:'s',end:'e',isAllDay}]}),el:id=>id==='schedule'?box:{},document:{createElement:()=>({})},categoryOf:()=> 'other',COLORS:{other:'#aaa'},LABELS:{other:'その他'},fmtTime:()=> '00:00',escapeHtml:s=>s};
  vm.runInNewContext(render+';renderSchedule()',ctx);
  assert.equal(rows.length,1);assert.equal(rows[0].innerHTML.includes('終日'),isAllDay);assert.equal(rows[0].innerHTML.includes('00:00'),!isAllDay);
 }
});

test('calendar update launches the installed script without opening JSON input or claiming success',()=>{
 const nodes={syncLaunchStatus:{hidden:true},syncHelpButton:{hidden:true},syncDialog:{open:false,showModal(){throw Error('manual dialog opened')}}};
 const location={};
 const fn=html.slice(html.indexOf('function launchCalendarSync('),html.indexOf("el('syncButton').onclick=launchCalendarSync;"));
 vm.runInNewContext(fn+';launchCalendarSync()',{el:id=>nodes[id],location,localStorage:{setItem(){}}});
 const url=new URL(location.href);
 assert.equal(url.protocol,'scriptable:');
 assert.equal(url.pathname,'/run/YOS%20Life%20Calendar%20Sync');
 assert.equal(url.searchParams.get('openEditor'),'false');
 assert.equal(nodes.syncHelpButton.hidden,false);
 assert.doesNotMatch(nodes.syncLaunchStatus.textContent,/更新しました|取り込みました/);
});


test('calendar import removes only exact duplicate events',()=>{
 const data={schedule:[],tasks:[]};let saved;
 const payload={date:'2026-09-23',events:[
  {id:'holiday-a',title:'秋分の日',start:'2026-09-22T15:00:00.000Z',end:'2026-09-23T15:00:00.000Z',isAllDay:true,location:''},
  {id:'holiday-b',title:'秋分の日',start:'2026-09-22T15:00:00.000Z',end:'2026-09-23T15:00:00.000Z',isAllDay:true,location:''},
  {id:'holiday-c',title:'秋分の日',start:'2026-09-22T15:00:00.000Z',end:'2026-09-23T15:00:00.000Z',isAllDay:true,location:''},
  {id:'festival',title:'琉球フェスティバル2026',start:'2026-09-22T15:00:00.000Z',end:'2026-09-23T15:00:00.000Z',isAllDay:true,location:''},
  {id:'later',title:'秋分の日',start:'2026-09-23T03:00:00.000Z',end:'2026-09-23T04:00:00.000Z',isAllDay:false,location:''}
 ]};
 vm.runInNewContext(importer+';importPayload(payload)',{payload,day:()=>data,today:()=>payload.date,categoryOf:()=> 'other',COLORS:{other:'#aaa'},KEY:'life',data,paint(){},localStorage:{setItem(k,v){saved=JSON.parse(v)}}});
 assert.equal(saved.schedule.length,3);
 assert.equal(saved.schedule.filter(e=>e.title==='秋分の日'&&e.isAllDay).length,1);
 assert.equal(saved.schedule.some(e=>e.id==='later'),true);
});
