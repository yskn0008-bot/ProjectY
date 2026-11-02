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
test('Native bridge cannot modify Notion, account storage or original Clarity',()=>{
 assert.doesNotMatch(code.replace("html.includes('localStorage.setItem(')",''),/Keychain\.set\(|localStorage\.setItem\(|req\.method=['"]PATCH|req\.method=['"]DELETE/);
 assert.match(code,/await web\.loadHTML\(html\)/);
 assert.match(code,/await web\.evaluateJavaScript\(/);
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
  assert.doesNotMatch(pkg.script,/Keychain\.set\(|req\.method=['"]PATCH|req\.method=['"]DELETE/);
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
