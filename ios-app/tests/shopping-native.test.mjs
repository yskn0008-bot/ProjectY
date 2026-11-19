import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT=new URL('../',import.meta.url);
const CODE=fs.readFileSync(new URL('scriptable/YOS Shopping.js',ROOT),'utf8');
const HTML=fs.readFileSync(new URL('../yos/shopping/index.html',ROOT),'utf8');
const CSS=fs.readFileSync(new URL('../yos/shopping/shopping.css',ROOT),'utf8');
const JS=fs.readFileSync(new URL('../yos/shopping/shopping.js',ROOT),'utf8');
const ID='42a5ca88289581a4b66ae9a3ad05c363';
const NOW='2026-11-19T10:00:00.000Z';

function row(opts={}){
 const item={
  id:ID,archived:false,last_edited_time:NOW,
  parent:{type:'data_source_id',data_source_id:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc'},
  cover:{type:'external',external:{url:'https://example.com/real-photo.png'}},
  properties:{
   商品名:{title:[{plain_text:'テスト用 洗顔 120g'}]},
   区分:{select:{name:'欲しいもの'}},
   分類:{select:{name:'美容'}},
   買い物状態:{select:{name:'検討中'}},
   購入済:{checkbox:false},
   現在価格:{number:null},参考価格:{number:1980},目標価格:{number:1500},
   価格更新日:{date:null},価格情報元:{select:null},
   販売店:{multi_select:[{name:'Amazon'}]},
   商品URL:{url:'https://example.com/product'},
   在庫数:{number:null},補充基準:{number:null}
  }
 };
 return Object.assign(item,opts);
}
async function run(config={}){
 const log={urls:[],requests:[],alerts:[],pages:[],completed:false};
 const pages=[row()];
 const token=config.token===false?'':'scriptable-private-notion-token';
 const id=ID;
 class MockRequest{
  constructor(url){this.url=url;this.body='';this.headers={};this.method='GET';this.response=null;log.urls.push(url)}
  async loadJSON(){
   log.requests.push({url:this.url,method:this.method,headers:this.headers,body:this.body});
   this.response={statusCode:200};
   if(this.url.includes('/data_sources/')&&this.url.endsWith('/query'))
    return {results:pages,has_more:false};
   if(this.url.endsWith('/pages/'+id)){
    if(this.method==='PATCH'){
      const patch=JSON.parse(this.body);
      pages[0].properties.購入済=patch.properties.購入済;
      pages[0].properties.買い物状態=patch.properties.買い物状態;
      pages[0].last_edited_time='2026-11-19T10:01:00.000Z';
    }
    return pages[0];
   }
   if(this.url.endsWith('/pages')&&this.method==='POST'){
     const request=JSON.parse(this.body);
     const name=request.properties['商品名'].title[0].text.content;
     if(pages.some(p=>p.properties.商品名.title[0].plain_text===name))
       throw Error('duplicate write should never happen');
     const created=row({id:'5'.repeat(32),last_edited_time:'2026-11-19T10:02:00.000Z',
       properties:{...pages[0].properties,商品名:{title:[{plain_text:name}]}}});
     pages.push(created);return created;
   }
   if(this.url.endsWith('/pages/'+'5'.repeat(32)))return pages[1];
   throw Error('unexpected Notion path '+this.url);
  }
  async loadString(){
   this.response={statusCode:config.assetFailure?500:200};
   if(this.url.endsWith('/index.html'))return HTML;
   if(this.url.endsWith('/shopping.css'))return CSS;
   if(this.url.endsWith('/shopping.js'))return JS;
   throw Error('Unexpected static asset '+this.url);
  }
 }
 class MockAlert{
  constructor(){this.title='';this.message='';this.actions=[];this.fields=[]}
  addAction(label){this.actions.push(label)}
  addCancelAction(label){this.actions.push(label)}
  addTextField(label,defaultValue){this.fields.push({label,defaultValue})}
  textFieldValue(index){return config.fields?.[index]??''}
  async presentAlert(){log.alerts.push({title:this.title,message:this.message,actions:this.actions});
   return typeof config.choice==='number'?config.choice:0}
 }
 const sandbox={
  Request:MockRequest,Alert:MockAlert,URL,Date,Intl,
  Keychain:{contains:()=>Boolean(token),get:()=>token},
  args:{queryParameters:config.query||{}},
  WebView:{loadHTML:async(html,...rest)=>{log.pages.push(html);assert.equal(rest.at(-1),true)}},
  Script:{complete(){log.completed=true}},
  console
 };
 await vm.runInNewContext('(async()=>{'+CODE+'\n})()',sandbox,{timeout:10000});
 return {log,pages};
}

test('Scriptable shopping uses native Keychain and Notion without Vercel or leaking a token',async()=>{
 const {log}=await run();
 assert.equal(log.pages.length,1);
 assert.match(log.pages[0],/テスト用 洗顔 120g/);
 assert.match(log.pages[0],/example.com\/real-photo.png/);
 assert.match(log.pages[0],/yos-shopping-local-v1/);
 assert.doesNotMatch(log.pages[0],/scriptable-private-notion-token/);
 assert.doesNotMatch(log.pages[0],/project-y-yos-ai\.vercel\.app/);
 assert.ok(log.urls.every(u=>u.startsWith('https://api.notion.com/')||u.startsWith('https://raw.githubusercontent.com/')));
 assert.ok(log.requests.every(x=>x.headers.Authorization==='Bearer scriptable-private-notion-token'));
 assert.equal(log.completed,true);
});

test('missing native token shows safe error and never retrieves data',async()=>{
 const {log}=await run({token:false});
 assert.equal(log.pages.length,0);
 assert.equal(log.urls.length,0);
 assert.match(log.alerts[0].title,/未接続/);
});

test('stale edit token rejects purchase without a Notion PATCH',async()=>{
 const {log}=await run({query:{action:'purchase',id:ID,expectedEditedAt:'2026-10-01T00:00:00.000Z'}});
 assert.equal(log.pages.length,0);
 assert.equal(log.requests.some(x=>x.method==='PATCH'),false);
 assert.match(log.alerts[0].message,/変更/);
});

test('explicit purchase confirmation updates Notion and checks readback',async()=>{
 const {log,pages}=await run({query:{action:'purchase',id:ID,expectedEditedAt:NOW}});
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,1);
 assert.equal(pages[0].properties.購入済.checkbox,true);
 assert.equal(log.pages.length,1);
 assert.match(log.pages[0],/"purchased":true/);
});

test('cancelled purchase leaves the original Notion record untouched',async()=>{
 const {log,pages}=await run({query:{action:'purchase',id:ID,expectedEditedAt:NOW},choice:-1});
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.equal(pages[0].properties.購入済.checkbox,false);
});

test('existing item is protected against duplicate creation',async()=>{
 const {log}=await run({query:{action:'add'},fields:['テスト用 洗顔 120g','https://example.com/product','']});
 assert.equal(log.requests.some(x=>x.method==='POST'&&x.url.endsWith('/pages')),false);
 assert.match(log.alerts[0].message,/重複登録/);
});

test('unavailable interface assets do not cause Notion writes or fabricated data',async()=>{
 const {log}=await run({assetFailure:true});
 assert.equal(log.pages.length,0);
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.match(log.alerts[0].message,/検証できません/);
});

test('shopping HTML uses the requested compact 2-column photo cards',()=>{
 assert.match(CSS,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(HTML,/id="productGrid"/);
 assert.match(JS,/値引き中/);
 assert.match(JS,/scriptable:\/\/\/run/);
 assert.doesNotMatch(JS,/\.vercel\.app|Authorization:|google\.accounts/);
 assert.doesNotThrow(()=>new Function(JS));
});
