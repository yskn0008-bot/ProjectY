import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCalendarWindow,selectWidgetFeed} from '../dist/widget/selection.js';
import {createWidgetFeedHandler} from '../dist/widget/handler.js';
import {loadNotionTaskDashboard} from '../dist/widget/notion-source.js';

const DATA_SOURCE_ID = '965c608632c1463d93b487a9cb69b3ad';
const WIDGET_TOKEN='a'.repeat(48);
const task=(order,title,due,state='次にやる',extra={})=>({
  order,title,due,state,priority:'P1',nextAction:'PRIVATE_NEXT_ACTION',
  blocker:'PRIVATE_BLOCKER',evidence:'PRIVATE_EVIDENCE',
  actionUrl:'scriptable:///run?scriptName=PRIVATE',...extra
});
const item=(title,due,state,order=null)=>({
  object:'page',properties:{
    '実行順':{number:order},
    'やること':{title:[{plain_text:title}]},
    '期限':{date:due?{start:due}:null},
    '状態':{select:{name:state}},
    '優先度':{select:{name:'P1'}},
    '次の一手':{rich_text:[{plain_text:'PRIVATE_NEXT_ACTION'}]}
  }
});
function makeHandler(pages){
  let fetched=0;
  const fetchImpl=async ()=>{fetched++;return Response.json({results:pages,has_more:false,next_cursor:null})};
  const handler=createWidgetFeedHandler({
    widgetToken:WIDGET_TOKEN,
    googleWorkloadAuth:{},
    notionToken:'test_not_real',
    notionDataSourceId:DATA_SOURCE_ID,
    fetchImpl
  });
  const get=(path,token=WIDGET_TOKEN)=>handler(new Request('https://example.test/api/yos/widget'+path,{
    method:'GET',headers:{Authorization:'Bearer '+token}
  }));
  return {get,fetchCount:()=>fetched};
}
test('calendar selector covers more than 3 due tasks, filters completed/outside range',()=>{
  const values=Array.from({length:7},(_,i)=>task(i+1,'Task '+i,'2026-11-03'));
  values.push(task(8,'done','2026-11-03','完了'),task(9,'out','2026-12-01'));
  const week=selectCalendarWindow(values,'2026-11-01T00:00:00Z','2026-11-01','2026-11-07',true);
  assert.equal(week.tasks.length,7);
  assert.equal(week.matchingCount,7);
  assert.equal(week.truncated,false);
  assert.equal(week.sourceComplete,true);
  assert.deepEqual(Object.keys(week.tasks[0]).sort(),['due','priority','state','title']);
  assert.doesNotMatch(JSON.stringify(week),/PRIVATE_/);
  assert.equal(selectWidgetFeed(values,null).tasks.length,3);
});
test('calendar selector discloses count caps and source pagination',()=>{
  const values=Array.from({length:102},(_,i)=>task(i+1,'Task '+i,'2026-11-03'));
  const feed=selectCalendarWindow(values,null,'2026-11-01','2026-11-07',true);
  assert.equal(feed.tasks.length,100);
  assert.equal(feed.matchingCount,102);
  assert.equal(feed.truncated,true);
  const incomplete=selectCalendarWindow(values.slice(0,3),null,'2026-11-01','2026-11-07',false);
  assert.equal(incomplete.truncated,true);
  assert.equal(incomplete.sourceComplete,false);
});
test('Notion calendar mode retains unnumbered due tasks without changing normal mode',async()=>{
  const fetchImpl=async ()=>Response.json({results:[
    item('unnumbered','2026-11-03','次にやる',null),
    item('numbered','2026-11-03','次にやる',1)
  ],has_more:false,next_cursor:null});
  const opts={notionToken:'fake',notionDataSourceId:DATA_SOURCE_ID,fetchImpl};
  const normal=await loadNotionTaskDashboard(opts);
  const calendar=await loadNotionTaskDashboard({...opts,calendarMode:true});
  assert.deepEqual(normal.tasks.map(x=>x.title),['numbered']);
  assert.equal(calendar.tasks.length,2);
  assert.equal(calendar.sourceComplete,true);
});
test('unauthenticated calendar request must not query private tasks',async()=>{
  const h=makeHandler([item('private','2026-11-03','次にやる')]);
  const r=await h.get('?mode=calendar&start=2026-11-01&end=2026-11-07','wrong');
  assert.equal(r.status,401);
  assert.equal(h.fetchCount(),0);
});
test('calendar window validates dates, rejects >31 days and malformed input before Notion fetch',async()=>{
  const h=makeHandler([]);
  for(const path of [
    '?mode=calendar&start=2026-11-01&end=2027-01-01',
    '?mode=calendar&start=2026-11-32&end=2026-12-01',
    '?mode=calendar&start=2026-11-07&end=2026-11-01',
    '?mode=calendar&start=2026-11-01'
  ]){
    const r=await h.get(path);
    assert.equal(r.status,400);
  }
  assert.equal(h.fetchCount(),0);
});
test('authorized calendar projection is minimal and does not change ordinary widget response',async()=>{
  const h=makeHandler([
    item('Due 1','2026-11-03','次にやる',null),
    item('Due 2','2026-11-04','次にやる',1),
    item('Due 3','2026-11-04','完了',2),
    item('Due 4','2026-11-05','実行中',3),
    item('Due 5','2026-11-06','次にやる',4)
  ]);
  const r=await h.get('?mode=calendar&start=2026-11-01&end=2026-11-07');
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control')||'',/no-store/);
  const feed=await r.json();
  assert.equal(feed.source,'notion');
  assert.deepEqual(feed.tasks.map(x=>x.title),['Due 1','Due 2','Due 4','Due 5']);
  assert.equal(feed.sourceComplete,true);
  assert.doesNotMatch(JSON.stringify(feed),/PRIVATE_/);
  const widget=await h.get('');
  assert.equal(widget.status,200);
  const original=await widget.json();
  assert.ok(original.tasks.length<=3);
  assert.equal(original.sourceState,'active');
  assert.equal(original.tasks[0].title,'Due 4');
  assert.equal(original.tasks.some(x=>x.title==='Due 1'),false);
});
