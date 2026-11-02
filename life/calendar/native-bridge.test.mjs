import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const code=fs.readFileSync(new URL('./YOS_DAYSTREAM_NativeBridge_Dev.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./daystream-native.html',import.meta.url),'utf8');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const rich=(txt)=>[{plain_text:txt}];
function fixture(credentials=true,apiBroken=false){
  let parsed=null,webHTML=null,alertCount=0,complete=0;
  const calls=[];
  class MockRequest{
    constructor(url){this.url=url;this.response={statusCode:200};calls.push(this)}
    async loadString(){return html}
    async loadJSON(){
      if(apiBroken) {this.response.statusCode=401;return {error:'unauthorized'}}
      const props=this.url.includes('965c6086') ?[
        {id:'t1',properties:{'やること':{title:rich('日記を確認')},'期限':{date:{start:today}},'状態':{select:{name:'実行中'}}}},
        {id:'t2',properties:{'やること':{title:rich('終わったこと')},'期限':{date:{start:today}},'状態':{select:{name:'完了'}}}}
      ]:[
        {id:'m1',properties:{'項目':{title:rich('本当の支出')},'日付':{date:{start:today}},'金額':{number:1800},'区分':{select:{name:'支出'}},'状態':{select:{name:'実績'}},'確度':{select:{name:'確認済'}}}},
        {id:'m2',properties:{'項目':{title:rich('内部資金移動')},'日付':{date:{start:today}},'金額':{number:5000},'区分':{select:{name:'資金移動'}},'状態':{select:{name:'実績'}},'確度':{select:{name:'確認済'}}}},
        {id:'m3',properties:{'項目':{title:rich('未確認の請求')},'日付':{date:{start:today}},'金額':{number:1200},'区分':{select:{name:'支出'}},'状態':{select:{name:'実績'}},'確度':{select:{name:'未確認'}}}}
      ];
      return {results:props,has_more:false,next_cursor:null};
    }
  }
  class MockWebView{
    async loadHTML(src){webHTML=src}
    async evaluateJavaScript(js){
      assert.match(js,/^window.YOS_DAYSTREAM_NATIVE_V1\(/);
      parsed=JSON.parse(js.slice(js.indexOf('(')+1,-1));return true;
    }
    async present(){return}
  }
  const mocks={
    Request:MockRequest,WebView:MockWebView,
    CalendarEvent:{async between(){return [
      {title:'医師の予約',startDate:new Date(`${today}T10:30:00+09:00`),isAllDay:false,identifier:'e1'},
      {title:'［タクシー需要］空港',startDate:new Date(`${today}T13:30:00+09:00`),isAllDay:false,identifier:'r1'}
    ]}},
    Keychain:{contains(){return credentials},get(){return 'EXAMPLE_SECRET_NOT_REAL'}},
    Alert:class{addAction(){}async presentAlert(){alertCount++}},
    Script:{complete(){complete++}}
  };
  const run=async()=>await new Function(...Object.keys(mocks),'return (async()=>{'+code+'})()')(...Object.values(mocks));
  return{run,calls,result:()=>({parsed,webHTML,alertCount,complete})};
}
test('Apple event and Notion task/money merge, private token never enters WebView',async()=>{
 const f=fixture();await f.run();const{parsed,webHTML,complete,alertCount}=f.result();
 assert.equal(complete,1);assert.equal(alertCount,0);assert.ok(webHTML.includes('YOS_DAYSTREAM_NATIVE_V1'));
 assert.equal(parsed.items.filter(x=>x.type==='schedule').length,1);
 assert.equal(parsed.items.filter(x=>x.type==='task').length,1);
 assert.equal(parsed.items.filter(x=>x.type==='money').length,2);
 assert.equal(parsed.items.find(x=>x.title==='本当の支出').complete,true);
 assert.equal(parsed.items.find(x=>x.title==='未確認の請求').complete,false);
 assert.equal(parsed.items.find(x=>x.title==='未確認の請求').reviewRequired,true);
 assert.equal(parsed.items.some(x=>x.title==='内部資金移動'),false);
 assert.equal(parsed.sources.apple.status,'ok');assert.equal(parsed.sources.tasks.status,'ok');assert.equal(parsed.sources.money.status,'ok');
 assert.doesNotMatch(JSON.stringify(parsed),/EXAMPLE_SECRET_NOT_REAL|PRIVATE_|Bearer|token/i);
 assert.equal(f.calls.filter(x=>x.method==='POST').length,2);
 for(const req of f.calls.filter(x=>x.method==='POST')){
  assert.match(req.url,/^https:\/\/api\.notion\.com\/v1\/data_sources\//);
  assert.equal(req.headers.Authorization,'Bearer EXAMPLE_SECRET_NOT_REAL');
  assert.equal(JSON.parse(req.body).filter.and.length,2);
 }
});
test('No Keychain leaves Apple available, Notion sources unconnected',async()=>{
 const f=fixture(false);await f.run();const{parsed,alertCount}=f.result();
 assert.equal(alertCount,0);assert.equal(parsed.sources.apple.status,'ok');assert.equal(parsed.sources.tasks.status,'unavailable');assert.equal(parsed.sources.money.status,'unavailable');
 assert.equal(parsed.items.length,1);
 assert.equal(f.calls.filter(x=>x.method==='POST').length,0);
});
test('Notion auth failure does not invent tasks or money while Apple still renders',async()=>{
 const f=fixture(true,true);await f.run();const{parsed,alertCount}=f.result();
 assert.equal(alertCount,0);assert.equal(parsed.sources.apple.status,'ok');assert.equal(parsed.sources.tasks.status,'error');assert.equal(parsed.sources.money.status,'error');
 assert.equal(parsed.items.length,1);
});
test('Native status update permits only approved Notion Task completion',()=>{
 assert.doesNotMatch(code,/Keychain\.set\(|req\.method=['"]DELETE|CalendarEvent\.create/);
 assert.equal([...code.matchAll(/req\.method='PATCH'/g)].length,1);
 assert.match(code,/approval\.addCancelAction\('反映しない'\)/);
 assert.match(code,/if\(await approval\.presentAlert\(\)!==0\)return/);
 assert.match(code,/TASK_ID\.test\(task\.id\)/);
 assert.match(code,/if\(status==='完了'\)return 'already'/);
 assert.match(code,/properties:\{'状態':\{select:\{name:'完了'\}\}\}/);
 assert.match(code,/const after=await notionPage\(task\.id,token\)/);
});

test('reviewed DAYSTREAM HTML checksum stays pinned to native bridge',()=>{
  const pinned=code.match(/const HTML_SHA256 = '([a-f0-9]{64})'/)?.[1];
  assert.equal(pinned,crypto.createHash('sha256').update(html).digest('hex'));
});
test('large Apple and Notion sources keep separate capacities and truthful partial status',async()=>{
  let snapshot;
  class ManyRequest {
    constructor(url){this.url=url;this.response={statusCode:200}}
    async loadString(){return html}
    async loadJSON(){
      const task=this.url.includes('965c6086');
      const rows=Array.from({length:180},(_,i)=>task?
        {id:'t'+i,properties:{'やること':{title:rich('タスク'+i)},'期限':{date:{start:today}},'状態':{select:{name:'実行中'}}}}:
        {id:'m'+i,properties:{'項目':{title:rich('支払'+i)},'日付':{date:{start:today}},'金額':{number:i+1},'区分':{select:{name:'支出'}},'状態':{select:{name:'実績'}},'確度':{select:{name:'確認済'}}}});
      return {results:rows,has_more:false};
    }
  }
  class ManyWeb {
    async loadHTML(src){assert.equal(src,html)}
    async evaluateJavaScript(js){snapshot=JSON.parse(js.slice(js.indexOf('(')+1,-1));return true}
    async present(){return}
  }
  const source={
    Request:ManyRequest,WebView:ManyWeb,
    CalendarEvent:{async between(){return Array.from({length:180},(_,i)=>({title:'予定'+i,startDate:new Date(today+'T10:30:00+09:00'),isAllDay:false,identifier:'e'+i}))}},
    Keychain:{contains(){return true},get(){return 'LOCAL_TEST_TOKEN'}},
    Alert:class{addAction(){}async presentAlert(){assert.fail('unexpected alert')}},
    Script:{complete(){}}
  };
  await new Function(...Object.keys(source),'return (async()=>{'+code+'})()')(...Object.values(source));
  assert.equal(snapshot.items.length,500);
  assert.equal(snapshot.items.filter(x=>x.type==='schedule').length,170);
  assert.equal(snapshot.items.filter(x=>x.type==='task').length,165);
  assert.equal(snapshot.items.filter(x=>x.type==='money').length,165);
  assert.deepEqual(Object.values(snapshot.sources).map(x=>x.status),['partial','partial','partial']);
  assert.doesNotMatch(JSON.stringify(snapshot),/LOCAL_TEST_TOKEN/);
});
test('DAYSTREAM prioritizes action and distinguishes full, partial and stale native snapshots',()=>{
  assert.ok(html.indexOf('<aside class="insight">')<html.indexOf('<section class="streamhead">'));
  assert.match(html,/function nativeSourceLabel\(\)/);
  assert.match(html,/complete===3\?'3種類取得済み'/);
  assert.match(html,/age>30\*60\*1000/);
  assert.match(html,/\.filter\{padding:9px 11px\}/);
});

test('native Notion finance is not silently replaced by outdated browser Money',()=>{
  assert.ok(html.includes('const joined=state.native?[...native,...life]:[...life,...money]'));
  assert.ok(html.includes('moneyPartial?\'Notion家計は一部取得'));
  assert.ok(html.includes("moneyValue').textContent=(!can||moneyPartial)?'—'"));
});

test('offline iPhone import package embeds the reviewed native page with no runtime UI download',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('./YOS_DAYSTREAM_iPhone_Review_20261102.scriptable',import.meta.url),'utf8'));
  assert.equal(pkg.name,'YOS DAYSTREAM 開発確認 20261102');
  assert.equal(pkg.always_run_in_app,true);
  assert.deepEqual(pkg.share_sheet_inputs,[]);
  assert.ok(pkg.script.includes('const HTML_BUNDLE='));
  assert.ok(pkg.script.includes('Offline DAYSTREAM HTML integrity mismatch'));
  assert.doesNotMatch(pkg.script,/const PREVIEW_URL|new Request\(PREVIEW_URL\)/);
  assert.doesNotMatch(pkg.script,/Keychain\.set\(|req\.method=['"]DELETE/);
  assert.equal([...pkg.script.matchAll(/req\.method='PATCH'/g)].length,1);
  assert.match(pkg.script,/await web\.loadHTML\(html\)/);
  const hash=pkg.script.match(/const HTML_SHA256 = '([a-f0-9]{64})'/)?.[1];
  assert.equal(hash,crypto.createHash('sha256').update(html).digest('hex'));
});

async function runCalendarMirrorFixture({apple=true,source='Apple Calendar',action='',taskDate=today}={}){
 let snapshot=null,alertCount=0;
 class RequestStub{
  constructor(url){this.url=url;this.response={statusCode:200}}
  async loadString(){return html}
  async loadJSON(){
   if(this.url.includes('965c6086'))return {results:[
    {id:'mirror-001',properties:{
      'やること':{title:rich('管理費・修繕費・駐車場引き落とし')},
      '期限':{date:{start:taskDate}},'状態':{select:{name:'次にやる'}},
      '正本・根拠':{rich_text:rich(source)},
      '同期キー':{rich_text:rich(source==='Apple Calendar'?'calendar:source:event':'')},
      '次の一手':{rich_text:rich(action)}
    }},
    {id:'personal-task',properties:{
      'やること':{title:rich('別の作業')},
      '期限':{date:{start:today}},'状態':{select:{name:'次にやる'}},
      '正本・根拠':{rich_text:rich('本人入力')}
    }}
   ],has_more:false};
   return {results:[{id:'finance-record',properties:{
     '項目':{title:rich('管理費・修繕費（要照合）')},
     '日付':{date:{start:today}},'金額':{number:14450},
     '区分':{select:{name:'支出'}},'状態':{select:{name:'予定'}},
     '確度':{select:{name:'未確認'}}
   }}],has_more:false};
  }
 }
 class WebViewStub{
  async loadHTML(src){assert.equal(src,html)}
  async evaluateJavaScript(js){snapshot=JSON.parse(js.slice(js.indexOf('(')+1,-1));return true}
  async present(){}
 }
 const mocks={
  Request:RequestStub,WebView:WebViewStub,
  CalendarEvent:{async between(){return apple?[{
   title:'管理費・修繕費・駐車場引き落とし',
   startDate:new Date(today+'T00:00:00+09:00'),isAllDay:true,identifier:'real-apple-id'
  }]:[]}},
  Keychain:{contains(){return true},get(){return 'FIXTURE_SECRET_NEVER_IN_VIEW'}},
  Alert:class{addAction(){}async presentAlert(){alertCount++}},
  Script:{complete(){}}
 };
 await new Function(...Object.keys(mocks),'return (async()=>{'+code+'})()')(...Object.values(mocks));
 assert.equal(alertCount,0);
 assert.ok(snapshot);
 assert.doesNotMatch(JSON.stringify(snapshot),/FIXTURE_SECRET_NEVER_IN_VIEW|Bearer /);
 return snapshot.items;
}
test('calendar mirror and independent action: keep one Apple event and finance, hide only its Notion echo',async()=>{
 const entries=await runCalendarMirrorFixture();
 assert.equal(entries.filter(x=>x.type==='schedule').length,1);
 assert.equal(entries.some(x=>x.id==='mirror-001'),false);
 assert.equal(entries.some(x=>x.id==='personal-task'),true);
 assert.equal(entries.some(x=>x.id==='finance-record'),true);
 assert.equal(entries.find(x=>x.id==='finance-record').amount,14450);
});
test('a genuine manual task with the same title remains visible',async()=>{
 const entries=await runCalendarMirrorFixture({source:'本人入力'});
 assert.equal(entries.some(x=>x.id==='mirror-001'),true);
});
test('a calendar-origin task with an explicit next action remains visible',async()=>{
 const entries=await runCalendarMirrorFixture({action:'口座残高を確認する'});
 assert.equal(entries.some(x=>x.id==='mirror-001'),true);
});
test('when Apple event is unavailable, the existing Notion calendar mirror remains visible',async()=>{
 const entries=await runCalendarMirrorFixture({apple:false});
 assert.equal(entries.some(x=>x.id==='mirror-001'),true);
});
test('a calendar-origin task for another day remains independent',async()=>{
 const date=new Date(today+'T12:00:00+09:00');date.setDate(date.getDate()+1);
 const next=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(date);
 const entries=await runCalendarMirrorFixture({taskDate:next});
 assert.equal(entries.some(x=>x.id==='mirror-001'),true);
});

function planLogic(){
 const from=html.indexOf('// DAYPLAN-BEGIN'),to=html.indexOf('// DAYPLAN-END',from);
 assert.ok(from>0&&to>from);
 return new Function(html.slice(from,to)+'\nreturn {planForDay,applyPlanOrder};')();
}
test('wake-to-sleep planner keeps anchors, habits, priority and fixed appointments',()=>{
 const {planForDay}=planLogic();
 const day=today;
 const rows=[
  {date:day,type:'schedule',title:'午前の予約',subtitle:'09:30',source:'Appleカレンダー',id:'cal1'},
  {date:day,type:'schedule',title:'夜の予定',subtitle:'19:00',source:'Appleカレンダー',id:'cal2'},
  {date:day,type:'task',title:'低優先',subtitle:'未完了',priority:'P3',source:'Notion Tasks',id:'native:8:low'},
  {date:day,type:'task',title:'高優先',subtitle:'未完了',priority:'P0',source:'Notion Tasks',id:'native:4:high'},
  {date:day,type:'money',title:'支払い予定',subtitle:'予定・未確認',source:'Notion家計',id:'m1'}
 ];
 const plan=planForDay(day,rows);
 assert.equal(plan[0].title,'起床');assert.equal(plan.at(-1).title,'就寝');
 assert.ok(plan.find(x=>x.title==='水を飲む'));
 assert.ok(plan.find(x=>x.title==='朝食・食事を記録'));
 assert.ok(plan.find(x=>x.title==='日記・振り返り'));
 assert.ok(plan.findIndex(x=>x.title==='午前の予約')<plan.findIndex(x=>x.title==='夜の予定'));
 assert.ok(plan.findIndex(x=>x.title==='高優先')<plan.findIndex(x=>x.title==='低優先'));
 assert.equal(plan.find(x=>x.title==='午前の予約').movable,false);
 assert.equal(plan.find(x=>x.title==='支払い予定').checkable,false);
 assert.equal(plan.find(x=>x.title==='高優先').checkable,true);
});
test('manual order moves flexible items while fixed appointments remain in place',()=>{
 const {planForDay,applyPlanOrder}=planLogic();
 const base=planForDay(today,[{date:today,type:'schedule',title:'病院',subtitle:'14:00',source:'Appleカレンダー',id:'c1'}]);
 const movable=base.filter(x=>x.movable);
 const order=[movable.at(-1).id,movable[0].id];const moved=applyPlanOrder(base,order);
 assert.equal(moved[0].title,'起床');assert.equal(moved.at(-1).title,'就寝');
 assert.equal(moved.findIndex(x=>x.title==='病院'),base.findIndex(x=>x.title==='病院'));
 assert.equal(moved.filter(x=>x.movable)[0].id,movable.at(-1).id);
 assert.equal(applyPlanOrder(base,['bogus',movable[0].id,movable[0].id]).filter(x=>x.movable).length,movable.length);
});
test('timestamped Notion task retains a fixed hour and P0 priority',()=>{
 assert.match(code,/const priority=select\(p\['優先度'\]\)/);
 assert.match(code,/const fixedTime=ts&&Number\.isFinite/);
 assert.match(html,/item\.fixedTime=/);
 assert.match(html,/x\.type==='task'&&x\.fixedTime/);
});
test('draft-only checks and reordering never write to original Notion or Apple data',()=>{
 assert.match(html,/const PLAN_KEY='yos-daystream-plan-v1'/);
 assert.match(html,/localStorage\.setItem\(PLAN_KEY,encoded\)/);
 assert.match(html,/タスクの完了反映は画面を閉じた後の本人確認が必要です/);
 assert.doesNotMatch(html,/https:\/\/api\.notion\.com\/v1\/pages\/.*PATCH|CalendarEvent\.create\(/);
 assert.ok(code.includes("!html.split('localStorage.'+'setItem(')[1].startsWith('PLAN_KEY,encoded)')"));
});

test('local dayplan check and ordering survive a re-open without Notion writes',()=>{
 const start=html.indexOf('// DAYPLAN-BEGIN'),end=html.indexOf(' function renderStream(){',start);
 assert.ok(start>=0&&end>start);
 const codePart=html.slice(start,end),storage=new Map();
 const localStorage={
  getItem(key){return storage.has(key)?storage.get(key):null},
  setItem(key,val){if(key!=='yos-daystream-plan-v1')throw Error('unsafe key');storage.set(key,val)}
 };
 class Element{
  constructor(){this.children=[];this.attrs={};this.events={};this.textContent=''}
  append(...xs){this.children.push(...xs)}
  replaceChildren(){this.children=[]}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(k,fn){this.events[k]=fn}
 }
 const create=()=>{
  const nodes=new Map(),document={createElement:()=>new Element()};
  const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
  const state={selected:today,items:[{date:today,type:'task',title:'契約書確認',
    subtitle:'未完了',priority:'P1',id:'native:9:contract',source:'Notion Tasks'}],demo:false};
  const factory=new Function('state','localStorage','document','$','isValidKey','names','window',
    codePart+'\nreturn {renderPlan,changeCheck,changeOrder,orderedPlan};');
  return factory(state,localStorage,document,$,x=>/^\d{4}-\d{2}-\d{2}$/.test(x),
    {schedule:'予定',task:'タスク',money:'お金',habit:'習慣'},{});
 };
 const first=create();first.renderPlan();const before=first.orderedPlan().filter(x=>x.movable);
 first.changeCheck('habit:water');first.changeOrder('habit:water',1);
 const saved=JSON.parse(storage.get('yos-daystream-plan-v1'))[today];
 assert.equal(saved.done['habit:water'],true);
 assert.notDeepEqual(saved.order,before.map(x=>x.id));
 const again=create();again.renderPlan();
 assert.equal(again.orderedPlan().filter(x=>x.movable)[0].id,'habit:stretch-am');
 assert.equal(saved.done['habit:water'],true);
 assert.equal(Object.keys(JSON.parse(storage.get('yos-daystream-plan-v1'))).length,1);
});

async function runConfirmedTaskFixture({approve=false,changedTitle=false,already=false,fileError=false,token=true,forged=false,mirror=false,badParent=false,changedOrigin=false,unchecked=false,exportFailure=false,corruptFile=false}={}){
 const taskId='11111111-2222-4333-8444-555555555555',key='task:Notion Tasks:native:'+taskId;
 const chosen=forged?'task:Notion Tasks:native:99999999-9999-4999-8999-999999999999':key;
 let status=already?'完了':'次にやる',patches=[],alerts=[],files=new Map(corruptFile?[['/local/YOS_DAYSTREAM_PLAN_STATE_v1.json','{invalid']]:[]),exports=0;
 const row={id:taskId,properties:{
  'やること':{title:rich('今日の書類を確認')},
  '期限':{date:{start:today}},'状態':{select:{name:'次にやる'}},
  '正本・根拠':{rich_text:rich(mirror?'Apple Calendar':'本人入力')},
  '同期キー':{rich_text:rich(mirror?'calendar:uuid':'')}
 }};
 class MockRequest{
  constructor(url){this.url=url;this.response={statusCode:200};this.method='GET'}
  async loadString(){return html}
  async loadJSON(){
   if(this.url.includes('/data_sources/'))return {results:this.url.includes('965c6086')?[row]:[],has_more:false};
   if(this.url.includes('/pages/'+taskId)){
    if(this.method==='PATCH'){
     patches.push(JSON.parse(this.body));status='完了';
    }
    return {object:'page',id:taskId,archived:false,parent:badParent?{type:'page_id',page_id:'00000000-0000-4000-8000-000000000000'}:{type:'data_source_id',data_source_id:'965c6086-32c1-463d-93b4-87a9cb69b3ad'},
     properties:{'やること':{title:rich(changedTitle?'different title':'今日の書類を確認')},
     '期限':{date:{start:today}},'状態':{select:{name:status}},
     '正本・根拠':{rich_text:rich(changedOrigin?'Apple Calendar':'本人入力')},
     '同期キー':{rich_text:rich(changedOrigin?'calendar:updated':'')}}};
   }
   throw Error('unexpected URL '+this.url);
  }
 }
 class MockWeb{
  async loadHTML(src){assert.equal(src,html)}
  async evaluateJavaScript(js){
   if(js.startsWith('window.YOS_DAYSTREAM_NATIVE_V1('))return true;
   if(js.startsWith('window.YOS_DAYSTREAM_PLAN_IMPORT('))return true;
   if(js==='window.YOS_DAYSTREAM_PLAN_EXPORT()'){exports++;if(exportFailure)throw Error('WebView detached');return {
     schema:'yos-daystream-plan-v1',days:{[today]:{order:[],done:unchecked?{}:{[chosen]:true}}},completedKeys:[chosen]
   }}
   throw Error('unexpected web script');
  }
  async present(){}
 }
 class MockAlert{
  constructor(){this.title=''}
  addAction(){}
  addCancelAction(){}
  async presentAlert(){alerts.push(this.title);return this.title==='Notion Tasksへ完了を反映'?(approve?0:1):0}
 }
 const mock={
  Request:MockRequest,WebView:MockWeb,Alert:MockAlert,
  CalendarEvent:{async between(){return []}},
  Keychain:{contains(){return token},get(){return 'FIXTURE_NOTION_TOKEN'}},
  FileManager:{local(){return{
   documentsDirectory(){return'/local'},joinPath(a,b){return a+'/'+b},
   fileExists(p){return files.has(p)},readString(p){return files.get(p)},
   writeString(p,v){if(fileError)throw Error('write denied');files.set(p,v)}
  }}},Script:{complete(){}}
 };
 await new Function(...Object.keys(mock),'return (async()=>{'+code+'})()')(...Object.values(mock));
 return {patches,alerts,exports,files,status};
}
test('explicit cancellation keeps Notion unchanged while saving local checkbox draft',async()=>{
 const x=await runConfirmedTaskFixture();
 assert.equal(x.patches.length,0);
 assert.ok(x.alerts.includes('Notion Tasksへ完了を反映'));
 assert.equal(x.files.size,1);
 assert.equal(x.exports,1);
});
test('explicit approval performs one guarded status-only PATCH and verifies readback',async()=>{
 const x=await runConfirmedTaskFixture({approve:true});
 assert.equal(x.patches.length,1);
 assert.deepEqual(x.patches[0],{properties:{'状態':{select:{name:'完了'}}}});
 assert.equal(x.status,'完了');
 assert.ok(x.alerts.includes('Notionへの反映結果'));
});
test('conflicting title or already completed source cannot be changed again',async()=>{
 for(const opts of [{approve:true,changedTitle:true},{approve:true,already:true}]){
  const x=await runConfirmedTaskFixture(opts);
  assert.equal(x.patches.length,0);
 }
});
test('failed local save prevents Notion completion submission',async()=>{
 const x=await runConfirmedTaskFixture({approve:true,fileError:true});
 assert.equal(x.patches.length,0);
 assert.ok(x.alerts.includes('実行リストは保存未確認'));
});
test('forged IDs, calendar mirrors, and unavailable credentials never update Notion',async()=>{
 for(const opts of [{approve:true,forged:true},{approve:true,mirror:true},{approve:true,token:false}]){
  const x=await runConfirmedTaskFixture(opts);
  assert.equal(x.patches.length,0);
 }
});

test('writeback refuses wrong data source, changed calendar origin and unchecked export',async()=>{
 for(const opts of [
   {approve:true,badParent:true},
   {approve:true,changedOrigin:true},
   {approve:true,unchecked:true}
 ]){
   const x=await runConfirmedTaskFixture(opts);
   assert.equal(x.patches.length,0);
 }
});
test('detached WebView and corrupt local plan file produce visible fail-closed results',async()=>{
 const exportError=await runConfirmedTaskFixture({approve:true,exportFailure:true});
 assert.equal(exportError.patches.length,0);
 assert.ok(exportError.alerts.includes('実行リストの保存を確認できず'));
 const corrupt=await runConfirmedTaskFixture({approve:true,corruptFile:true});
 assert.equal(corrupt.patches.length,0);
 assert.ok(corrupt.alerts.includes('既存の実行リストを保護'));
 assert.equal(corrupt.files.get('/local/YOS_DAYSTREAM_PLAN_STATE_v1.json'),'{invalid');
});
