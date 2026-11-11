import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../scriptable/YOS JOURNAL.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const money={category:'MONEY',title:'家計と予算を見直す',summary:'家計管理と資金計画に役立つ予算の確認方法です。',reason:'家計の計画をするための一般的な情報です。',
 action:'元記事で内容を確かめる',caveat:'条件は未確認',source:'Source',sourceDate:'2026-11-12',link:'https://example.org/money'};
const health={category:'HEALTH',title:'健康とストレッチの基本',summary:'健康維持に向けた運動とストレッチの実践方法です。',reason:'運動を検討する人向けの一般情報です。',
 action:'医療情報の原典を読む',caveat:'個別の安全性は未確認',source:'Source',sourceDate:'2026-11-12',link:'https://example.org/health'};
const feed={date:'2026年11月12日',issuedOn:'2026-11-12',headline:'古い並びのままの見出し',lead:'公的情報の参考記事',articles:[health,money]};
function task(name,state='次にやる',priority='P2',area=''){
 const rich=x=>[{plain_text:x}];
 return {properties:{
  'やること':{title:rich(name)},'状態':{select:{name:state}},'優先度':{select:{name:priority}},
  '次の一手':{rich_text:rich('状況を確認する')},'ブロッカー':{rich_text:[]},'領域':{select:{name:area}},
  '期限':{date:null}
 }};
}
async function show({tasks=[],keys=[],notionError=false,widgetTasks=null,overrideArticles=null}={}){
 const requests=[],files=new Map();
 const fm={
  documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,
  fileExists:p=>files.has(p),createDirectory:p=>files.set(p,'directory'),
  writeString:(p,v)=>files.set(p,v),readString:p=>files.get(p)
 };
 class Request{
  constructor(url){this.url=url;this.response={statusCode:200};requests.push(this)}
  async loadString(){
   if(!this.url.includes('raw.githubusercontent.com/'))throw Error('Unauthorized data transfer');
   return JSON.stringify(overrideArticles?{...feed,articles:overrideArticles}:feed);
  }
  async loadJSON(){
   if(this.url.startsWith('https://api.notion.com/v1/data_sources/')){
    if(notionError)throw Error('Notion unavailable');
    return {results:tasks,has_more:false,next_cursor:null};
   }
   if(this.url==='https://project-y-yos-ai.vercel.app/api/yos/widget'){
    return {tasks:widgetTasks??[]};
   }
   throw Error('Unexpected API '+this.url);
  }
 }
 class WebView{async loadHTML(h){this.html=h;view=h}async present(){}}
 const Keychain={contains:k=>keys.includes(k),get:k=>keys.includes(k)?'MOCK_AUTH_ONLY':''};
 let view='';
 await new AsyncFunction('FileManager','Keychain','Request','WebView','Script','args',script)(
  {local:()=>fm},Keychain,Request,WebView,{complete(){}},{shortcutParameter:null}
 );
 return {html:view,files,requests};
}
const headline=html=>html.match(/<h2 class="cover-headline">([^<]+)/)?.[1];
test('Notion active Money task outranks completed Health task, even when feed order is opposite',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('健康ストレッチを続ける','完了','P0','Health'),
  task('家計の予算を調整する','実行中','P1','Money')
 ]});
 assert.equal(headline(r.html),money.title);
 assert.match(r.html,/Money · 実行中 · 記事と一致する具体項目：家計・予算/);
 assert.doesNotMatch(r.html,/Health · 完了/);
});
test('same issue reacts to task state changes without saving a new public issue',async()=>{
 const before=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('家計の予算を調整する','実行中','P1'),task('健康ストレッチを続ける','完了','P1')
 ]});
 const after=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('家計の予算を調整する','完了','P1'),task('健康ストレッチを続ける','実行中','P1')
 ]});
 assert.equal(headline(before.html),money.title);
 assert.equal(headline(after.html),health.title);
});
test('no Keychain never claims relevance; public issue remains readable',async()=>{
 const r=await show();
 assert.equal(headline(r.html),health.title);
 assert.match(r.html,/Notionの現在地は未照合/);
 assert.equal(r.requests.some(x=>x.url.includes('api.notion.com')),false);
});
test('task content remains in device memory, not cached public JSON or sent to GitHub',async()=>{
 const secret='個人専用メモの家計予算';
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[task(secret,'実行中','P0')]});
 assert.equal(r.requests.some(x=>x.url.includes('models.github.ai')),false);
 assert.equal(r.requests.some(x=>x.url.startsWith('http')&&x.body?.includes(secret)),false);
 assert.doesNotMatch(r.html,/個人専用メモ/);
 for(const saved of r.files.values())assert.doesNotMatch(String(saved),/個人専用メモ/);
});
test('completed and postponed tasks cannot falsely make issue personalized',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('家計の予算を調整する','完了','P0'),task('健康ストレッチを続ける','保留','P0')
 ]});
 assert.equal(headline(r.html),'今のタスクに直接役立つ記事は未発見');
 assert.match(r.html,/現在のタスクに具体的に一致する記事は、この号にありません/);
 assert.doesNotMatch(r.html,/記事と一致する具体項目/);
});
test('existing secured widget feed is labeled partial, not complete Notion synchronization',async()=>{
 const r=await show({keys:['MY_WAY_WIDGET_TOKEN'],widgetTasks:[
  {title:'家計の予算を調整する',state:'実行中',priority:'P1',nextAction:'確認'}
 ]});
 assert.equal(headline(r.html),money.title);
 assert.match(r.html,/既存タスク表示（最大3件）の部分照合/);
});
test('Notion API error falls back to existing widget token without false full sync',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN','MY_WAY_WIDGET_TOKEN'],notionError:true,
  widgetTasks:[{title:'健康ストレッチを続ける',state:'次にやる',priority:'P1'}]});
 assert.equal(headline(r.html),health.title);
 assert.match(r.html,/部分照合/);
});
test('only approved hosts receive authentication and no credentials enter public article cache',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[]});
 const authenticated=r.requests.filter(x=>x.headers?.Authorization);
 assert.ok(authenticated.length);
 assert.ok(authenticated.every(x=>x.url.startsWith('https://api.notion.com/v1/data_sources/')));
 assert.ok([...r.files.values()].every(x=>!String(x).includes('MOCK_AUTH_ONLY')));
});


test('generic Money advice is not promoted just because a Money task is in progress',async()=>{
 const broad={...money,title:'家計の話題と暮らし',summary:'家計に関する一般的な情報の紹介です。',link:'https://example.org/generic'};
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[task('返済日と借入条件を確認する','実行中','P0','Money')],overrideArticles:[broad]});
 assert.equal(headline(r.html),'今のタスクに直接役立つ記事は未発見');
 assert.doesNotMatch(r.html,/>家計の話題と暮らし<\/h2>/);
});
test('next concrete task is used only when no in-progress task has a matching story',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('返済日と借入条件を確認する','実行中','P0','Money'),
  task('健康ストレッチを続ける','次にやる','P2','Health')
 ]});
 assert.equal(headline(r.html),health.title);
 assert.match(r.html,/次にやるタスクに対応する記事候補/);
});
test('in-progress concrete task stays ahead of a higher-priority next task',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('家計の予算を調整する','実行中','P3','Money'),
  task('健康ストレッチを続ける','次にやる','P0','Health')
 ]});
 assert.equal(headline(r.html),money.title);
 assert.match(r.html,/取り組み中タスクに対応する記事候補/);
});
test('concrete next action must match the article, not only the task title',async()=>{
 const t=task('家計の予算を調整する','実行中','P1','Money');
 t.properties['次の一手']={rich_text:[{plain_text:'銀行口座の残高を確認する'}]};
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[t]});
 assert.equal(headline(r.html),'今のタスクに直接役立つ記事は未発見');
 assert.doesNotMatch(r.html,/>家計と予算を見直す<\/h2>/);
});
test('current blocked/waiting and deferred/complete tasks cannot drive article selection',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('家計の予算を調整する','待ち','P0','Money'),
  task('健康ストレッチを続ける','保留','P0','Health')
 ]});
 assert.equal(headline(r.html),'今のタスクに直接役立つ記事は未発見');
});
test('no matching source article creates no fake personalized story',async()=>{
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('借入の返済期限を確認する','実行中','P0','Money')
 ]});
 assert.equal(headline(r.html),'今のタスクに直接役立つ記事は未発見');
 assert.match(r.html,/AWAITING EDITION/);
 assert.doesNotMatch(r.html,/記事と一致する具体項目/);
});


test('Money category alone with a vague budget headline is not a useful current-task article',async()=>{
 const vague={...money,title:'家計のニュースまとめ',summary:'家計について広く紹介する一般記事です。',action:'記事の内容を読む'};
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('家計の予算を調整する','実行中','P1','Money')
 ],overrideArticles:[vague]});
 assert.equal(headline(r.html),'今のタスクに直接役立つ記事は未発見');
 assert.doesNotMatch(r.html,/>家計のニュースまとめ<\/h2>/);
});
test('Money headline concepts alone do not qualify without body evidence',async()=>{
 const superficial={...money,title:'家計予算に関する見出しだけ',summary:'一般的な情報やニュースを紹介します。',action:'ニュースを見る'};
 const r=await show({keys:['YOS_NOTION_INTEGRATION_TOKEN'],tasks:[
  task('家計の予算を調整する','実行中','P1','Money')
 ],overrideArticles:[superficial]});
 assert.equal(headline(r.html),'今のタスクに直接役立つ記事は未発見');
});
