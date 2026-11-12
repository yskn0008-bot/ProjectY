import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url),'utf8');
const html=script.match(/const html=\x60([\s\S]*?)\x60;\s*const payload=/)?.[1]||'';
const client=html.match(/<script>([\s\S]*?)<\\\/script>/)?.[1]||'';
const native=script.slice(script.indexOf('const YOS_TASK_SOURCE='),script.indexOf('async function main(){'));
const slotSource=client.match(/\/\/ YOS_UNIFIED_SLOT_START([\s\S]*?)\/\/ YOS_UNIFIED_SLOT_END/)?.[1]||'';
const batchSource=client.match(/\/\/ YOS_UNIFIED_BATCH_START([\s\S]*?)\/\/ YOS_UNIFIED_BATCH_END/)?.[1]||'';

const row=(id,title,status='次にやる',area='Work',due='2026-11-12')=>({
 id,properties:{
 'やること':{title:[{plain_text:title}]},
 '状態':{select:{name:status}},
 '領域':{select:{name:area}},
 '優先度':{select:{name:'P1'}},
 '期限':due?{date:{start:due}}:null,
 '次の一手':{rich_text:[{plain_text:'本人判断が必要'}]},
 }});
const sample=[
 row('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','応募書類を作成'),
 row('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','部屋を片付ける','次にやる','Life',''),
 row('cccccccccccccccccccccccccccccccc','完了済み','完了','Money')
];
function hooks({token='LOCAL_ONLY_SECRET',results=[{results:sample,has_more:false}],code=200,habit}={}){
 const requests=[];
 class Request{
  constructor(url){this.url=url;this.response=null;requests.push(this)}
  async loadJSON(){this.response={statusCode:code};return results.shift()||{results:[],has_more:false}}
 }
 const keychain={contains:()=>Boolean(token),get:()=>token};
 const files=new Map();if(habit)files.set('/local/YOS_HABIT_FLOW_v1.json',JSON.stringify(habit));
 const FileManager={local:()=>({documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),readString:p=>files.get(p)})};
 const api=vm.runInNewContext(native+'\n({yosParseTask,yosReadTaskSource,yosReadHabits})',{Request,Keychain:keychain,FileManager,Date});
 return {...api,requests,files};
}

test('standalone Scriptable source and embedded WebView JS have valid syntax',()=>{
 assert.ok(html&&client&&native);
 new (Object.getPrototypeOf(async function(){}).constructor)(script);
 new vm.Script(client);
 assert.match(script,/YOS_SCRIPT_NAME: YOS Timeline Charcoal 確認 20261111/);
});

test('source task records preserve domain, deadline and next action; omit completed tasks',()=>{
 const h=hooks();
 const first=h.yosParseTask(sample[0]);
 assert.equal(first.area,'Work');
 assert.equal(first.due,'2026-11-12');
 assert.equal(first.priority,'P1');
 assert.equal(first.action,'本人判断が必要');
 assert.equal(first.status,'次にやる');
 assert.equal(h.yosParseTask(sample[1]).due,'');
 assert.equal(h.yosParseTask(sample[2]),null);
 assert.equal(h.yosParseTask({id:'malformed',properties:sample[0].properties}),null);
});

test('Notion Tasks read-only source uses existing data-source ID and never sends credentials to WebView',async()=>{
 const h=hooks();const x=await h.yosReadTaskSource();
 assert.equal(x.status,'ok');assert.equal(x.items.length,2);
 assert.deepEqual(Array.from(x.items.map(t=>t.area)),['Work','Life']);
 assert.equal(h.requests.length,1);
 const req=h.requests[0];
 assert.match(req.url,/\/v1\/data_sources\/965c6086-32c1-463d-93b4-87a9cb69b3ad\/query$/);
 assert.equal(req.method,'POST');
 assert.equal(req.headers.Authorization,'Bearer LOCAL_ONLY_SECRET');
 assert.doesNotMatch(script,/\/v1\/pages\/|req\.method\s*=\s*['"](?:PATCH|PUT|DELETE)['"]/);
 assert.match(script,/const payload=JSON\.stringify\(\{days:state\.days,hiddenCalendar:state\.hiddenCalendar\|\|\{\},calendarDays,allDayDays,calendarCoverage,taskSource,habitSource/);
 assert.doesNotMatch(script,/JSON\.stringify\(\{days:state\.days,calendarDays,token/);
 assert.equal(JSON.stringify(x).includes('LOCAL_ONLY_SECRET'),false);
});

test('without Notion token or with read error, the source is clearly unavailable, never empty-but-confirmed',async()=>{
 const missing=hooks({token:''});const a=await missing.yosReadTaskSource();
 assert.equal(a.status,'unavailable');assert.equal(a.items.length,0);assert.equal(missing.requests.length,0);
 const blocked=hooks({code:401});const b=await blocked.yosReadTaskSource();
 assert.equal(b.status,'error');assert.equal(b.items.length,0);
});

test('read pagination and duplicate source IDs do not create additional task copies',async()=>{
 const a=row('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Task A'),b=row('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','Task B');
 const h=hooks({results:[{results:[a],has_more:true,next_cursor:'cursor1'},{results:[a,b],has_more:false}]});
 const out=await h.yosReadTaskSource();
 assert.equal(out.status,'ok');assert.equal(out.items.length,2);
 assert.equal(JSON.parse(h.requests[1].body).start_cursor,'cursor1');
});

test('habit entries come only from the existing habit source, with no synthetic completed status',()=>{
 const habit={schema:'yos-habit-flow-v1',version:1,lists:{
  daily:[{id:'walk_after_meal',kind:'habit',title:'食後5分歩く',timing:'食後'}],
  weekly:[],monthly:[],yearly:[]}};
 const h=hooks({habit});const out=h.yosReadHabits();
 assert.equal(out.status,'ok');assert.equal(out.items.length,1);
 assert.equal(out.items[0].trigger,'食後');assert.equal(out.items[0].title,'食後5分歩く');
 assert.equal(out.items[0].done,undefined);
 assert.equal(h.files.size,1);
 const missing=hooks().yosReadHabits();assert.equal(missing.status,'unavailable');
});

test('15-minute slot planning never moves fixed or previously accepted events and preserves buffer',()=>{
 const find=vm.runInNewContext(slotSource+'\nyosFindSlot',{});
 assert.equal(find([{s:540,d:60,f:1}],540,30),615);
 assert.equal(find([{s:540,d:60,f:1},{s:615,d:45,kind:'task'}],540,30),675);
 assert.equal(find([],542,30),555);
 assert.equal(find([{s:0,d:1440,f:1}],0,30),null);
 assert.equal(find([],1430,30),null);
 assert.equal(find([],540,241),null);
});

test('slot acceptance requires explicit click, exact reviewed day/time, and local-only storage',()=>{
 assert.match(client,/この配置を採用/);
 assert.match(client,/selectedDay!==proposedDay/);
 assert.match(client,/fresh!==at/);
 assert.match(client,/sourceRef:ref/);
 assert.match(client,/savedDays\[selectedDay\]=items\.filter\(x=>x\.source!=='Apple Calendar'\)/);
 assert.match(client,/元の期限と予定は変更しません/);
 assert.match(client,/端末内で仮完了/);
 assert.doesNotMatch(client,/localStorage\.(getItem|setItem)/);
 assert.ok(html.includes('id="yosSourceTasks"'));
 assert.ok(html.includes('id="yosHabitTasks"'));
 assert.ok(html.includes('id="yosStartFrom"'));
});

test('old separate user data and reference calendars remain protected',()=>{
 assert.match(script,/const STORE_NAME='YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1\.json'/);
 assert.match(script,/const dayItems=day=>\[\.\.\.calendarItems\(day\)/);
 assert.match(script,/YOS_NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN'/);
 assert.doesNotMatch(script,/YOS_DAYSTREAM_GLASS_VERIFY_20261111_v1\.json|YOS_DAYSTREAM_TIMELINE_REVIEW_v1\.json/);
 assert.doesNotMatch(script,/CalendarEvent\.create|CalendarEvent\.remove|CalendarEvent\.save/);
});


test('batch prioritizes near due dates over undated tasks without inventing fixed appointments',()=>{
 const logic=vm.runInNewContext(slotSource+batchSource+'\n({yosFindSlot,yosBatchPlan})',{Date});
 const tasks=[
  {id:'undated',title:'long term',priority:'P0',status:'次にやる',due:'',area:'Work'},
  {id:'today',title:'payment check',priority:'P2',status:'次にやる',due:'2026-11-11',area:'Money'},
  {id:'tomorrow',title:'appointment prep',priority:'P1',status:'実行中',due:'2026-11-12',area:'Life'},
  {id:'waiting',title:'blocked',priority:'P0',status:'待ち',due:'2026-11-11',area:'Life'}
 ];
 const plans=logic.yosBatchPlan(tasks,[{s:540,d:60,f:1}],540,'2026-11-11');
 assert.deepEqual(Array.from(plans.map(x=>x.task.id)),['today','tomorrow','undated']);
 assert.deepEqual(Array.from(plans.map(x=>x.at)),[615,660,705]);
 assert.ok(plans.every(x=>x.d===30));
 assert.equal(plans.find(x=>x.task.id==='waiting'),undefined);
});

test('batch declines to consume the last 30 percent of available time',()=>{
 const logic=vm.runInNewContext(slotSource+batchSource+'\n({yosFindSlot,yosBatchPlan})',{Date});
 const tasks=Array.from({length:4},(_,i)=>({id:String(i),title:'task '+i,status:'次にやる',priority:'P1',due:'2026-11-11'}));
 assert.equal(logic.yosBatchPlan(tasks,[],1380,'2026-11-11').length,0);
 assert.equal(logic.yosBatchPlan(tasks,[{s:0,d:1320,f:1}],1320,'2026-11-11').length,1);
 assert.equal(logic.yosBatchPlan(tasks,[],1440,'2026-11-11').length,0);
});

test('stale overdue items are not silently auto-replanned and batch requires review before mutation',()=>{
 const logic=vm.runInNewContext(slotSource+batchSource+'\n({yosFindSlot,yosBatchPlan})',{Date});
 const tasks=[
  {id:'stale',title:'old task',status:'実行中',priority:'P0',due:'2026-10-01'},
  {id:'recent',title:'recent task',status:'実行中',priority:'P1',due:'2026-11-10'}
 ];
 const result=logic.yosBatchPlan(tasks,[],600,'2026-11-11');
 assert.deepEqual(Array.from(result.map(x=>x.task.id)),['recent']);
 assert.match(client,/この配置を採用/);
 assert.match(client,/まとめてこの配置を採用/);
 assert.match(client,/selectedDay!==day/);
 assert.match(client,/JSON\.stringify\(proposed\.map/);
 assert.match(client,/元の期限や状態は変更していません/);
});

test('native plan storage verifies previous-content backup before replacement, restores on write failure',()=>{
 assert.match(script,/const backup=path\+'\.previous'/);
 assert.match(script,/backup verification failed/);
 assert.match(script,/restore verification failed/);
 assert.match(script,/if\(fm\.readString\(path\)!==after\)throw Error\('readback failed'\)/);
 assert.match(script,/if\(!validPlan\(changed\)\|\|current!==expected\)throw Error/);
});


test('explicitly marked fictional Apple calendar events are display-only hidden and reversible',()=>{
 const match=client.match(/^const yosIsTestCalendarTitle=title=>.*$/m);
 assert.ok(match,'calendar test-event classifier should exist');
 const classify=vm.runInNewContext(match[0]+'\nyosIsTestCalendarTitle',{});
 for(const value of ['YOS-TEST-DELIVERY-20261112','YOS-TEST_20261112','【架空】支払予定','[架空] お知らせ']){
  assert.equal(classify(value),true,'expected to hide tagged fake: '+value);
 }
 for(const value of ['実際の予定','テスト営業','YOS-TESTING企画','YOS TEST 日程']){
  assert.equal(classify(value),false,'must not hide untagged or plausible real event: '+value);
 }
 assert.match(html,/id="yosTestToggle"[^>]*hidden/);
 assert.match(client,/let showTestCalendar=false/);
 assert.match(client,/showTestCalendar\|\|!x\.isTest/);
 assert.match(client,/items=\[\.\.\.calendarItems\(selectedDay\),\.\.\.items\.filter\(x=>x\.source!=='Apple Calendar'\)\]/);
 assert.match(client,/元カレンダーは変更していません/);
 assert.doesNotMatch(script,/CalendarEvent\.(?:create|remove|save)\(/);
});



test('real WebView runtime accepts day changes and preserves each day of local plan',()=>{
 const actualHtml=Function('return `'+html+'`')();
 const actualClient=actualHtml.split('<script>')[1]?.split('</script>')[0]||'';
 assert.ok(actualClient);
 new vm.Script(actualClient);
 const from=actualClient.indexOf('function parseDay(iso){'),to=actualClient.indexOf('function renderWeek()');
 const navigation=from>=0&&to>from?actualClient.slice(from,to):'';
 assert.ok(navigation);
 const env=vm.runInNewContext(`
  const localISO=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const savedDays={'2026-11-12':[{id:1,t:'動作確認',s:600,d:30,kind:'task'}],'2026-11-13':[{id:2,t:'別の日',s:660,d:30,kind:'task'}]};
  const dayItems=day=>(savedDays[day]||[]).map(x=>({...x}));
  const todayISO='2026-11-12',taskSource={status:'unavailable'},habitSource={status:'unavailable'};
  let selectedDay=todayISO,items=dayItems(todayISO),isSample=false,selectedId=null,zoom=null;
  const note={textContent:''},planBox={textContent:''},focus={classList:{remove(){}}},editor={classList:{remove(){}}};
  const yosStatusWord=()=> '未接続';
  const yosDefaultStart=()=>{},yosRenderSources=()=>{},yosRefreshTestToggle=()=>{},hideMonthPicker=()=>{},hideSwipeDelete=()=>{};const isCalendarCovered=()=>true;let calendarMode='day';const renderDayAllDay=()=>{},renderWeekAgenda=()=>{};
  const renderWeek=()=>{},render=()=>{},updateReview=()=>{};
  const window={scrollTo(){}};
  `+navigation+`
  ({showDay,snapshot:()=>({selectedDay,titles:items.map(x=>x.t),original:savedDays['2026-11-12'].map(x=>x.t)})});
 `,{Date});
 env.showDay('2026-11-13');
 assert.equal(env.snapshot().selectedDay,'2026-11-13');
 assert.deepEqual(Array.from(env.snapshot().titles),['別の日']);
 env.showDay('2026-02-30');
 assert.equal(env.snapshot().selectedDay,'2026-11-13','invalid civil date must be rejected');
 env.showDay('2026-11-12');
 assert.equal(env.snapshot().selectedDay,'2026-11-12');
 assert.deepEqual(Array.from(env.snapshot().titles),['動作確認']);
 assert.deepEqual(Array.from(env.snapshot().original),['動作確認']);
});

test('calendar header uses in-app month grid rather than a hidden WKWebView date picker',()=>{
 const actualHtml=Function('return `'+html+'`')();
 const actualClient=actualHtml.split('<script>')[1]?.split('</script>')[0]||'';
 assert.ok(actualHtml.includes('id="dateBtn"')&&actualHtml.includes('aria-controls="monthPicker"'));
 assert.ok(actualHtml.includes('id="monthPicker" hidden'));
 assert.ok(actualClient.includes("getElementById('dateBtn').onclick="));
 assert.ok(!actualClient.includes('picker.showPicker(')&&!actualClient.includes('picker.click('));
 const from=actualClient.indexOf("const monthPanel=document.getElementById('monthPicker')");
 const to=actualClient.indexOf('function updateNow()');
 const module=from>=0&&to>from?actualClient.slice(from,to):'';
 assert.ok(module);
 const controls={monthPicker:{hidden:true},monthGrid:{children:[],set textContent(v){this.children=[]},append(x){this.children.push(x)}},dateBtn:{setAttribute(k,v){this[k]=v}},monthCaption:{},monthCoverage:{},prevMonth:{},nextMonth:{},monthToday:{}};
 const document={getElementById:id=>controls[id],createElement:type=>({type,textContent:'',setAttribute(k,v){this[k]=v},append(...items){this.children=(this.children||[]).concat(items)}})};
 const env=vm.runInNewContext(`
  const selectedDay='2026-11-12',todayISO='2026-11-12';
  const parseDay=iso=>{const p=iso.split('-').map(Number);return new Date(p[0],p[1]-1,p[2],12)};
  const localISO=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  let chosen=null;const showDay=iso=>{chosen=iso;hideMonthPicker()};let calendarMode='day';const setCalendarMode=()=>hideMonthPicker();const yosDaySummary=()=>({entries:[],allDay:[],deadlines:[],covered:true});const calendarCoverage={status:'ok'};
  `+module+`
  ({chosen:()=>chosen});
 `,{Date,document});
 controls.dateBtn.onclick();
 assert.equal(controls.monthPicker.hidden,false);
 assert.equal(controls.dateBtn['aria-expanded'],'true');
 assert.equal(controls.monthCaption.textContent,'2026年 11月');
 const target=controls.monthGrid.children.find(b=>String(b['aria-label']||'').startsWith('2026-11-13'));
 assert.ok(target);target.onclick();
 assert.equal(env.chosen(),'2026-11-13');
 assert.equal(controls.monthPicker.hidden,true);
 controls.dateBtn.onclick();controls.prevMonth.onclick();
 assert.equal(controls.monthCaption.textContent,'2026年 10月');
 controls.nextMonth.onclick();assert.equal(controls.monthCaption.textContent,'2026年 11月');
});


test('DAYSTREAM keeps one local plan across month, week and 24-hour day views',()=>{
 const actualHtml=Function('return `'+html+'`')();
 const actualClient=actualHtml.split('<script>')[1]?.split('</script>')[0]||'';
 new vm.Script(actualClient);
 assert.ok(actualHtml.includes('id="calendarModes"'));
 assert.ok(actualHtml.includes('id="weekOverview"'));
 assert.ok(actualHtml.includes('id="timelinePanel"'));
 for(const name of ['month','week','day'])assert.ok(actualHtml.includes('data-view="'+name+'"'));
 assert.match(actualClient,/function setCalendarMode\(mode\)/);
 assert.match(actualClient,/function renderWeekAgenda\(\)/);
 assert.match(actualClient,/function renderMonth\(\)/);
 assert.match(actualClient,/function renderDayAllDay\(\)/);
 assert.match(actualClient,/sourceTasks\.filter\(x=>x\.due===day/);
 assert.match(actualClient,/dayItems\(day\)/);
 assert.match(actualClient,/calendarMode==='day'/);
 assert.match(actualClient,/calendarMode!=='week'/);
 assert.match(actualClient,/Apple予定未確認/);
 assert.match(actualClient,/setCalendarMode\('day'\);showDay\(iso\)/);
 assert.doesNotMatch(actualClient,/localStorage\.(?:getItem|setItem)/);
 assert.match(script,/const STORE_NAME='YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1\.json'/);
});

test('DAYSTREAM native source projects fixed timed and all-day events into a bounded period, with unknown days explicit',()=>{
 assert.match(script,/const calendarDays=\{\},allDayDays=\{\}/);
 assert.match(script,/now\.getMonth\(\)-1,1\)/);
 assert.match(script,/now\.getMonth\(\)\+3,1\)/);
 assert.match(script,/await CalendarEvent\.between\(start,end\)/);
 assert.match(script,/if\(event\.isAllDay\)/);
 assert.match(script,/calendarCoverage\.status=records\.length>maxEvents\?'partial':'ok'/);
 assert.match(client,/isCalendarCovered=day=>/);
 assert.match(client,/allDayItems=day=>/);
 assert.match(client,/元カレンダーは変更していません/);
 assert.doesNotMatch(script,/CalendarEvent\.(?:create|remove|save)\(/);
});


test('previous local DAYSTREAM plan is accepted and reversible display-only hide metadata is validated',()=>{
 const from=script.indexOf('function validPlan(value){'),end=script.indexOf('\nfunction key(d)',from);
 assert.ok(from>=0&&end>from);
 const validPlan=vm.runInNewContext(script.slice(from,end)+'\nvalidPlan',{});
 const old={version:1,days:{'2026-11-12':[{id:300000001,t:'動作確認',s:600,d:30,kind:'task'}]}};
 assert.equal(validPlan(old),true,'already-saved real iPhone task must remain readable');
 const updated={...old,hiddenCalendar:{'2026-11-12':['2026-11-12|190|5|架空通知']}};
 assert.equal(validPlan(updated),true,'reversible display-only hidden calendar entries are accepted');
 assert.equal(validPlan({...old,hiddenCalendar:{'bad-date':['x']}}),false);
 assert.equal(validPlan({...old,hiddenCalendar:{'2026-11-12':['x'.repeat(257)]}}),false);
 assert.equal(validPlan({...old,hiddenCalendar:[]}),false);
 assert.match(script,/const STORE_NAME='YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1.json'/);
 assert.match(script,/JSON.stringify\(\{version:1,days:savedDays,hiddenCalendar\}\)/);
 assert.match(script,/hiddenCalendar:state.hiddenCalendar\|\|\{\}/);
});

test('fake notification placeholders are hidden by default without hiding real all-day appointments',()=>{
 const actualHtml=Function('return \`'+html+'\`')();
 const realJs=actualHtml.split('<script>')[1]?.split('</script>')[0]||'';
 const definition=realJs.match(/^const yosIsTestCalendarTitle=.*$/m)?.[0];
 assert.ok(definition);
 const classify=vm.runInNewContext(definition+'\nyosIsTestCalendarTitle',{});
 assert.equal(classify('【通知テスト再実行 5/6】 OTP ｜【架空】ログイン確認コード'),true);
 assert.equal(classify('[通知テスト再実行 6/6] サンプル'),true);
 assert.equal(classify('YOS-TEST-DELIVERY-20261112'),true);
 assert.equal(classify('家賃収入日'),false);
 assert.equal(classify('仕事｜打ち合わせ'),false);
 assert.match(realJs,/showTestCalendar\|\|!x.isTest/);
 assert.match(realJs,/hiddenCalendar\[day\]/);
 assert.match(realJs,/delete hiddenCalendar\[selectedDay\]/);
 assert.doesNotMatch(script,/CalendarEvent\.(?:create|remove|save)\(/);
});

test('iPhone selected Apple event offers only reversible local hide while editable tasks have two-click deletion',()=>{
 const actualHtml=Function('return \`'+html+'\`')();
 const realJs=actualHtml.split('<script>')[1]?.split('</script>')[0]||'';
 new vm.Script(realJs);
 assert.ok(actualHtml.includes('id="hideFixed"'));
 assert.ok(actualHtml.includes('id="deleteSelected"'));
 assert.ok(actualHtml.includes('class="actions-row"'));
 assert.match(realJs,/function showFocusFor\(item\)/);
 assert.match(realJs,/getElementById\('doneBtn'\).hidden=!!fixed/);
 assert.match(realJs,/getElementById\('editSelected'\).hidden=!!fixed/);
 assert.match(realJs,/getElementById\('deleteSelected'\).hidden=!!fixed/);
 assert.match(realJs,/getElementById\('hideFixed'\).hidden=!canHide/);
 assert.match(realJs,/if\(deleteConfirmId!==item.id\)/);
 assert.match(realJs,/document.getElementById\('deleteSelected'\).textContent='削除を確定'/);
 assert.match(realJs,/if\(!item\|\|item.source!=='Apple Calendar'\|\|!item.calendarKey\)return/);
 assert.match(realJs,/getElementById\('hideFixed'\).onclick/);
 assert.match(realJs,/元の予定は保持/);
 assert.ok(actualHtml.includes('max-height:126px'));
 assert.ok(actualHtml.includes('padding-top:calc(28px + env(safe-area-inset-top))'));
});


test('existing daystream v1 plan accepts optional bound shortcut but rejects malformed names',()=>{
 const from=script.indexOf('function validPlan(value){'),to=script.indexOf('\nfunction key(d)',from);
 assert.ok(from>0&&to>from);
 const valid=vm.runInNewContext(script.slice(from,to)+'\nvalidPlan',{});
 const local={id:300000001,t:'動作確認',s:600,d:30,kind:'task'};
 const wrap=task=>({version:1,days:{'2026-11-12':[task]}});
 assert.equal(valid(wrap(local)),true);
 assert.equal(valid(wrap({...local,shortcut:'朝の準備'})),true);
 assert.equal(valid(wrap({...local,shortcut:44})),false);
 assert.equal(valid(wrap({...local,shortcut:'a'.repeat(101)})),false);
 assert.ok(script.includes("const STORE_NAME='YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1.json'"));
 assert.ok(script.includes("kind,shortcut"));
});

test('task gesture swipe waits for explicit delete and tap only toggles a local task',()=>{
 const htmlBody=Function('return '+String.fromCharCode(96)+html+String.fromCharCode(96))();
 const actualClient=htmlBody.split('<script>')[1]?.split('</script>')[0]||'';
 new vm.Script(actualClient);
 const start=actualClient.indexOf("const gestureBar=document.getElementById('gestureDelete')");
 const end=actualClient.indexOf("function smoothRender(activeId",start);
 assert.ok(start>0&&end>start);
 const controller=actualClient.slice(start,end);
 const elements={};
 const document={getElementById:id=>elements[id]??(elements[id]={hidden:true,textContent:''})};
 const local={id:300000001,t:'動作確認',s:600,d:30,kind:'task',done:false};
 const other={id:300000002,t:'保存する別タスク',s:660,d:30,kind:'task'};
 const stats={saves:0,edits:[]};
 let timerFn=null;
 const fn=[
 "const document=globalDocument,stats=globalStats,focus={classList:{remove(){}}},note={textContent:''};",
 "let swipeDeleteId=null,items=[globalLocal,globalOther];",
 "const persist=()=>{stats.saves++;return true};",
 "const smoothRender=()=>{},updateReview=()=>{},beginLocalEdit=item=>stats.edits.push(item.id);",
 controller,
 "const listeners={},el={style:{},addEventListener:(name,cb)=>listeners[name]=cb};",
 "wireTaskGestures(el,globalLocal);",
 "({listeners,items:()=>items,drawer:()=>document.getElementById('gestureDelete').hidden,bindSecond:()=>{const handlers={},el={style:{},addEventListener:(type,cb)=>handlers[type]=cb};wireTaskGestures(el,globalOther);return handlers;}})"
 ].join('\n');
 const env=vm.runInNewContext(fn,{globalDocument:document,globalStats:stats,globalLocal:local,globalOther:other,setTimeout:callback=>{timerFn=callback;return 1},clearTimeout:()=>{timerFn=null}});
 env.listeners.touchstart({touches:[{clientX:220,clientY:200}]});
 env.listeners.touchend();
 assert.equal(local.done,true);
 assert.equal(stats.saves,1);
 env.listeners.touchstart({touches:[{clientX:220,clientY:200}]});
 env.listeners.touchmove({touches:[{clientX:125,clientY:202}],preventDefault(){}});
 env.listeners.touchend();
 assert.equal(env.drawer(),false);
 assert.equal(env.items().length,2);
 elements.gestureDeleteConfirm.onclick();
 assert.equal(env.items().length,1);
 assert.equal(env.items()[0].id,other.id);
 assert.equal(stats.saves,2);
 const second=env.bindSecond();
 second.touchstart({touches:[{clientX:220,clientY:200}]});
 second.touchmove({touches:[{clientX:222,clientY:240}],preventDefault(){throw Error('vertical scroll blocked')}});
 second.touchend();
 assert.equal(other.done,undefined,'vertical scrolling must not complete task');
 second.touchstart({touches:[{clientX:220,clientY:200}]});
 assert.ok(timerFn,'long-press timer should be registered');
 timerFn();
 second.touchend();
 assert.deepEqual(stats.edits,[other.id]);
 assert.equal(other.done,undefined,'long press must not complete task');
 assert.equal(stats.saves,2);
 assert.match(actualClient,/beginLocalEdit\(item\)/);
 assert.match(actualClient,/setTimeout\(\(\)=>\{/);
 assert.match(actualClient,/action.addEventListener\(type,e=>e.stopPropagation\(\)\)/);
});

test('shortcuts icon uses only user-set name and Scriptable hands off allowlisted run URL',()=>{
 const actualHtml=Function('return '+String.fromCharCode(96)+html+String.fromCharCode(96))();
 const clientJs=actualHtml.split('<script>')[1]?.split('</script>')[0]||'';
 assert.ok(actualHtml.includes('id="newShortcut"'));
 assert.ok(actualHtml.includes('id="gestureDelete"'));
 assert.ok(clientJs.includes("action.href='shortcuts://run-shortcut?name='+encodeURIComponent(item.shortcut)"));
 assert.ok(clientJs.includes("action.className='shortcut-launch'"));
 const from=script.indexOf("const shortcutPrefix='shortcuts://run-shortcut?name='"),to=script.indexOf('\nconst html=',from);
 assert.ok(from>0&&to>from);
 const view={shouldAllowRequest:null},opened=[];
 vm.runInNewContext(script.slice(from,to),{view,Safari:{open:u=>opened.push(u)},console});
 assert.equal(view.shouldAllowRequest({url:'about:blank'}),true);
 assert.equal(view.shouldAllowRequest({url:'shortcuts://run-shortcut?name=%E6%9C%9D'}),false);
 assert.deepEqual(opened,['shortcuts://run-shortcut?name=%E6%9C%9D']);
 assert.equal(view.shouldAllowRequest({url:'shortcuts://run-shortcut?name=x&unexpected=1'}),false);
 assert.equal(opened.length,1);
 assert.doesNotMatch(script,/CalendarEvent\.(?:remove|save|create)\(/);
});


test('editor action buttons have visible spacing and shortcut icons show separate setup and launch states',()=>{
 const rendered=Function('return '+String.fromCharCode(96)+html+String.fromCharCode(96))();
 const js=rendered.split('<script>')[1]?.split('</script>')[0]||'';
 assert.ok(rendered.includes('class="editor-actions"'));
 assert.ok(rendered.includes('gap:16px'));
 assert.ok(rendered.includes('min-height:46px'));
 assert.ok(rendered.includes('id="saveBtn"'));
 assert.ok(rendered.includes('id="cancelEditor"'));
 assert.ok(rendered.includes('登録前は＋で設定、登録後は▶で実行'));
 assert.ok(rendered.includes('＋＝登録・▶＝実行'));
 assert.ok(js.includes("action.textContent=linked?'▶':'＋'"));
 assert.ok(js.includes("action.className='shortcut-launch'+(linked?' linked':'')"));
 assert.ok(js.includes("action.href='shortcuts://run-shortcut?name='+encodeURIComponent(item.shortcut)"));
 assert.ok(!rendered.includes("カードの⚡"));
 assert.ok(!js.includes("action.textContent='⚡'"));
 assert.match(js,/beginLocalEdit\(item,true\)/);
});


test('DAYSTREAM compatibility assesses confirmed conflicts without guessing health or geography',()=>{
 const actualHtml=Function('return '+String.fromCharCode(96)+html+String.fromCharCode(96))();
 const js=actualHtml.split('<script>')[1]?.split('</script>')[0]||'';
 const first=js.indexOf('const yosCompatRank=');
 const last=js.indexOf('let latestCompatibility=',first);
 assert.ok(first>0&&last>first,'compatibility classifier is embedded in actual WebView');
 const evaluate=vm.runInNewContext(js.slice(first,last)+'\nyosCompatibility',{});
 const t=(id,name,start,duration,kind='task',fixed=0)=>({id,t:name,s:start,d:duration,kind,f:fixed});
 const overlaps=evaluate([t(1,'打合せ',600,60,'schedule',1),t(2,'作業',620,30)]);
 assert.equal(overlaps.get(1).level,'danger');
 assert.equal(overlaps.get(2).level,'danger');
 assert.match(overlaps.get(1).reasons[0],/固定予定との時間衝突/);
 const prep=evaluate([t(3,'外出準備',600,20),t(4,'外出',625,30)]);
 assert.equal(prep.get(3).level,'positive');
 assert.equal(prep.get(4).level,'positive');
 assert.match(prep.get(4).reasons[0],/候補/);
 const cleanup=evaluate([t(5,'筋トレ',660,30),t(6,'入浴',695,30,'habit')]);
 assert.equal(cleanup.get(5).level,'positive');
 assert.equal(cleanup.get(6).level,'positive');
 const short=evaluate([t(7,'読書',450,30,'task'),t(8,'運動',483,25,'habit')]);
 assert.equal(short.get(7).level,'negative');
 const unknown=evaluate([t(9,'銀行手続',600,30),t(10,'夕食',700,30,'habit')]);
 assert.equal(unknown.get(9).level,'unknown');
 assert.equal(unknown.get(10).level,'unknown');
 const prioritize=evaluate([t(11,'外出準備',600,20),t(12,'外出',620,30),t(13,'固定面談',625,30,'schedule',1)]);
 assert.equal(prioritize.get(12).level,'danger','actual conflict outranks positive suggestions');
 assert.match(js,/latestCompatibility=yosCompatibility\(items\)/);
 assert.match(js,/el.classList.add\('compat-'\+compat.level\)/);
 assert.match(js,/function yosRenderCompatibility\(\)/);
 assert.match(js,/yosRenderCompatibility\(\);/);
 assert.match(actualHtml,/id="compatStatus"/);
 assert.match(actualHtml,/id="compatReview"/);
 assert.doesNotMatch(js,/Notion\.updatePage|CalendarEvent\.save/);
});


test('overlap warning counts intersection windows and gives a 15-minute range',()=>{
 const actual=Function('return '+String.fromCharCode(96)+html+String.fromCharCode(96))();
 const js=actual.split('<script>')[1]?.split('</script>')[0]||'';
 const start=js.indexOf('function yosOverlapWindows(rows){'),stop=js.indexOf('let latestCompatibility=',start);
 assert.ok(start>=0&&stop>start);
 const evaluate=vm.runInNewContext(js.slice(start,stop)+'\nyosOverlapWindows',{});
 const item=(id,t,s,d)=>({id,t,s,d,kind:'task'});
 const overlaps=evaluate([item(1,'削除テスト',585,30),item(2,'動作確認',600,30)]);
 assert.equal(overlaps.length,1);
 assert.equal(overlaps[0].from,600);
 assert.equal(overlaps[0].until,615);
 assert.deepEqual(Array.from(overlaps[0].titles),['削除テスト','動作確認']);
 const three=evaluate([item(1,'A',540,60),item(2,'B',570,60),item(3,'C',610,40)]);
 assert.equal(three.length,2,'two separated overlap time ranges are two actual warning areas');
 assert.equal(three[0].from,570);
 assert.equal(three[0].until,600);
 assert.equal(three[1].from,610);
 assert.equal(three[1].until,630);
 const noOverlap=evaluate([item(1,'A',585,15),item(2,'B',600,30)]);
 assert.equal(noOverlap.length,0);
 assert.ok(actual.includes('時間の重複：'));
 assert.ok(actual.includes('overlap-button'));
 assert.ok(actual.includes('分重複'));
 assert.ok(actual.includes('overlap-details'));
 assert.ok(actual.includes('padding-right:24px'));
 assert.ok(!actual.includes('inset 0 0 0 2px #ed8a93'));
 assert.doesNotMatch(script,/CalendarEvent\.(?:save|remove|create)\(/);
});


test('conflict pulse is short, icon-only and respects reduced-motion accessibility',()=>{
 const rendered=Function('return '+String.fromCharCode(96)+html+String.fromCharCode(96))();
 assert.match(rendered,/@keyframes yos-conflict-signal/);
 assert.match(rendered,/\.card\.compat-danger:after\{animation:yos-conflict-signal \.8s ease-in-out 3\}/);
 assert.match(rendered,/@media \(prefers-reduced-motion:reduce\)\{\.card\.compat-danger:after\{animation:none\}\}/);
 assert.doesNotMatch(rendered,/\.card\.compat-danger\{animation:/);
});


test('overlap notice preserves original task purple and uses restrained amber, not an alarming red fill',()=>{
 const htmlBody=Function('return '+String.fromCharCode(96)+html+String.fromCharCode(96))();
 assert.ok(htmlBody.includes('.card.task{background:#823db0'));
 assert.match(htmlBody,/\.card\.compat-danger:before\{background:#d8b07d;width:3px\}/);
 assert.match(htmlBody,/\.card\.compat-danger:after\{content:"!";[^}]*background:#e7bd83/);
 assert.match(htmlBody,/\.compat-status \.overlap-button\{border:1px solid #a48b6c;[^}]*background:#50463d/);
 assert.doesNotMatch(htmlBody,/\.card\.compat-danger\{[^}]*background:#(?:a63e50|bf485b|7a3441)/i);
 assert.match(htmlBody,/\.card\.compat-danger:after\{animation:yos-conflict-signal \.8s ease-in-out 3\}/);
 assert.match(htmlBody,/@media \(prefers-reduced-motion:reduce\)/);
});
