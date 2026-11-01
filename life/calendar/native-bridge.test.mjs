import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
