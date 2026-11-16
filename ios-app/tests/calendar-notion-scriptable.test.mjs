import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../scriptable/YOS Calendar Notion.js',import.meta.url),'utf8');
const fixedDate='2026-11-23';
const title=name=>({title:[{plain_text:name}]});
const date=start=>({date:{start}});
const select=name=>({select:{name}});
function fixture(url){
 const match=String(url).match(/data_sources\/([^/]+)\/query$/);
 if(!match)throw Error('unexpected URL '+url);
 const id=match[1],p={};
 if(id==='965c6086-32c1-463d-93b4-87a9cb69b3ad'){p['やること']=title('返済期限');p['期限']=date('2026-11-23');p['領域']=select('Money');p['状態']=select('次にやる')}
 else if(id==='30df9a73-2ea7-4ff7-8187-2b62dc8f9da4'){p['イベント名']=title('勤務');p['発生日時']=date('2026-11-23T03:00:00Z')}
 else if(id==='829c91b0-08dc-4ab0-b8fd-b9725dd0d9d2'){p['人物・イベント']=title('記念日');p['記念日']=date('2026-11-23')}
 else if(id==='d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc'){p['商品名']=title('セール');p['セール予定日']=date('2026-11-23')}
 else if(id==='95b30d16-7530-40c6-a320-dab99acad55d'){p['項目']=title('支払');p['日付']=date('2026-11-22T15:00:00.000Z');p['状態']=select('予定');p['区分']=select('支出');p['確度']=select('確認済');p['金額']={number:1200}}
 else if(id==='9205e5b7-f8b9-4497-9d6f-4727d67e4866'){p['案件名']=title('仕事の確認');p['対応期限']=date('2026-11-23');p['分野']={multi_select:[{name:'仕事'}]}}
 else throw Error('unknown source '+id);
 return {id:id.replace(/-/g,'').slice(0,31)+'a',properties:p};
}
async function run({hasKey=true,failSource=null,moneyPrivate=false,failAsset=false}={}){
 const requests=[],assets=[],alerts=[],injected=[],loaded=[],probes=[];
 class FakeRequest{
  constructor(url){this.url=url}
  async loadString(){
   assets.push(this.url);
   this.response={statusCode:failAsset?404:200};
   const name=this.url.split('/').pop();
   if(name==='approved-calendar.css')return '#approvedCalendar{}'+'.cal-chip{}'.repeat(1000);
   if(name==='approved-calendar.js')return '/* YOS_APPROVED_CALENDAR */'+('var ok=true;').repeat(800);
   if(name==='habit-calendar.js')return '/* YOS_CALENDAR_HABITS */'+('var habit=true;').repeat(50);
   throw Error('unexpected asset '+name);
  }
  async loadJSON(){
   requests.push({url:this.url,auth:this.headers?.Authorization,version:this.headers?.['Notion-Version'],method:this.method});
   if(this.url.includes(failSource||'source-never-fails')){this.response={statusCode:403};return {message:'not found'}}
   this.response={statusCode:200};
   return {results:[fixture(this.url)],has_more:false};
  }
 }
 class FakeWebView{
  static async loadHTML(html,base,preferred,fullscreen){
   assert.equal(fullscreen,true);
   loaded.push(html);
   const start=html.indexOf('const bridge=')+'const bridge='.length;
   const stop=html.indexOf(';',start);
   assert.ok(start>12&&stop>start);
   const payload=JSON.parse(html.slice(start,stop));
   injected.push(payload);
  }
  async loadHTML(html){probes.push(html)}
  async evaluateJavaScript(code){
   if(code.includes("localStorage.getItem('yos-money-v2')"))return moneyPrivate;
   throw Error('Unexpected native JavaScript evaluation after rendering');
  }
 }
 class FakeAlert{
  constructor(){this.title='';this.message=''}
  addAction(){}
  async presentAlert(){alerts.push({title:this.title,message:this.message});return 0}
 }
 const scope={Request:FakeRequest,WebView:FakeWebView,Alert:FakeAlert,
  Keychain:{contains:()=>hasKey,get:()=>hasKey?'test-token':''},
  Script:{complete(){}},Intl,Date,Promise,JSON,Error,String,Number,Object,Array,RegExp,Math,Set,Map};
 await vm.runInNewContext('(async()=>{\n'+script+'\n})()',scope,{timeout:5000});
 return {requests,assets,alerts,injected,loaded,probes};
}
test('direct Notion Calendar reads six existing sources without any Vercel or new auth',async()=>{
 const r=await run();
 assert.equal(r.requests.length,6);
 assert.equal(r.loaded.length,1);
 assert.match(r.loaded[0],/<!doctype html>/);
 assert.match(r.loaded[0],/approved-calendar/);
 assert.equal(r.assets.length,3);
 assert.ok(r.assets.every(x=>x.startsWith('https://raw.githubusercontent.com/yskn0008-bot/ProjectY/8a09f912da184582ad8b2e01bce809b10ddb1c7d/life/calendar/')));
 assert.doesNotMatch(script,/await view\.loadURL\(UI\)/);
 assert.match(script,/await WebView\.loadHTML\(html,null,null,true\)/);
 assert.doesNotMatch(script,/view\.evaluateJavaScript\(waitJS/);
 assert.match(r.loaded[0],/YOS CALENDAR　画面を読み込んでいます/);
 assert.ok(r.requests.every(x=>x.auth==='Bearer test-token'&&x.version==='2026-03-11'&&x.method==='POST'));
 assert.ok(r.requests.every(x=>x.url.startsWith('https://api.notion.com/v1/data_sources/')));
 assert.equal(r.injected.length,1);
 assert.equal(r.injected[0].items.length,6);
 assert.equal(r.injected[0].items.find(x=>x.type==='money').date,fixedDate);
 assert.equal(r.injected[0].items.find(x=>x.title==='勤務').clock,'12:00');
 assert.equal(r.injected[0].items.find(x=>x.title==='仕事の確認').area,'Work');
 assert.equal(r.injected[0].moneyRead,true);
 assert.ok(!script.includes('vercel.app')&&!script.includes('GoogleSignIn'));
});
test('missing iPhone Notion Keychain fails closed without opening the UI',async()=>{
 const r=await run({hasKey:false});
 assert.equal(r.requests.length,0);assert.equal(r.loaded.length,0);
 assert.match(r.alerts[0].message,/既存Keychain/);
});
test('one unavailable source is labelled unavailable instead of inventing its data',async()=>{
 const r=await run({failSource:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc'});
 assert.equal(r.injected[0].items.length,5);
 assert.ok(r.injected[0].otherSources.extraStatus.some(x=>x.name==='YOS Shopping'&&x.status==='unavailable'));
 assert.ok(!r.injected[0].items.some(x=>x.title==='セール'));
});
test('calendar adapter never writes Notion or persists raw source data into GitHub',()=>{
 assert.doesNotMatch(script,/req\.method\s*=\s*['"](?:PATCH|DELETE|PUT)['"]/);
 assert.doesNotMatch(script,/localStorage\.setItem|Keychain\.set|FileManager\.local/);
 assert.match(script,/api\.update\(bridge\)/);
 assert.match(script,/scriptable:\/\/\/run\?scriptName=YOS%20Calendar%20Notion/);
});

test('existing Money privacy toggle keeps private Notion amounts out of WebView entirely',async()=>{
 const r=await run({moneyPrivate:true});
 assert.equal(r.injected.length,1);
 assert.ok(!r.injected[0].items.some(x=>x.type==='money'));
 assert.equal(r.injected[0].moneyPrivate,true);
 assert.equal(r.injected[0].moneyRead,false);
});

test('asset download failure shows a specific error instead of presenting an empty black WebView',async()=>{
 const r=await run({failAsset:true});
 assert.equal(r.loaded.length,0);
 assert.equal(r.injected.length,0);
 assert.match(r.alerts[0]?.message||'',/画面部品/);
});


test('new static WebView bootstraps complete approved UI without evaluating its displayed instance',async()=>{
 const r=await run();
 assert.equal(r.loaded.length,1);
 assert.equal(r.probes.length,1);
 assert.match(r.loaded[0],/const bridge=/);
 assert.match(r.loaded[0],/window\.YOS_APPROVED_CALENDAR/);
 assert.match(r.loaded[0],/42日付枠|42/);
 assert.match(r.loaded[0],/yosBootMessage/);
 assert.ok(!r.loaded[0].includes('test-token'));
 assert.doesNotMatch(script,/view\.present\(true\)/);
 assert.doesNotMatch(script,/await view\.evaluateJavaScript\(expression\)/);
});
test('special HTML in Notion title stays data and cannot close inline scripts',async()=>{
 const r=await run();
 assert.match(script,/JSON\.stringify\(data\)\.replace\(\/<\/g/);
 assert.equal(r.injected[0].items.length,6);
});
