import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../YOS Journal Book.js',import.meta.url),'utf8');
const encode=x=>Buffer.from(x).toString('base64');
function fixture(overrides={}){return {date:'2026-11-13',story:'【出来事】打ち合わせ\n【気持ち】安心した',diary:'【今日の記憶】\n【出来事】打ち合わせ\n【気持ち】安心した',question:'今日の問い',answer:'原文',...overrides};}
async function open(options={}){
  const input=fixture(options.input),query=options.mode==='compose'?{mode:'compose',date:input.date}:{date:input.date,story:encode(input.story),diary:encode(input.diary),question:encode(input.question),answer:encode(input.answer)};
  const state={html:'',opened:[],requests:[],presented:0,backups:[]};
  class WebView{async loadHTML(html){state.html=html;}async present(){state.presented++;}async evaluateJavaScript(s){if(options.readbackFails)throw new Error('readback');if(s.includes('yosFinish'))return options.finished!==false;if(s.includes('yosMood'))return options.mood||'';return options.review===undefined?input.story:options.review;}}
  class Alert{addAction(){}addCancelAction(){}async presentAlert(){return options.choice??-1;}}
  const fakeTasks=options.tasks||[];
  const Data={fromBase64String:s=>({toRawString:()=>Buffer.from(s,'base64').toString()}),fromString:s=>({toBase64String:()=>encode(s)})};
  const Request=class{constructor(url){this.url=url;this.response={statusCode:200};}async loadJSON(){state.requests.push({url:this.url,method:this.method,body:JSON.parse(this.body||'{}')});return {results:fakeTasks};}};
  const fileMocks={saved:[],iCloud(){return this},local(){return this},documentsDirectory(){return '/documents'},joinPath(a,c){return a+'/'+c},writeString(path,value){if(options.fileWriteFails)throw Error('write denied');this.saved.push({path,value});}};
 state.backups=fileMocks.saved;
 const ctx={args:{queryParameters:query},Data,WebView,Alert,FileManager:fileMocks,CalendarEvent:{between:async()=>options.calendar||[]},Keychain:{contains:()=>options.auth!==false,get:()=> 'mock-token'},Request,Intl,Date,Safari:{open:url=>state.opened.push(url)},Script:{complete(){}}};
  try{await vm.runInNewContext('(async()=>{'+source+'})()',ctx);return state;}catch(error){return {...state,error};}
}
const task=(title,date='2026-11-13T14:00:00+09:00',status='完了')=>({
 properties:{
  'やること':{title:[{text:{content:title}}]},
  '期限':{date:{start:date}},
  '状態':{select:{name:status}}
 }
});

test('single-page adult paper journal has minimal editable note and non-fake photo placeholder',async()=>{
 const r=await open();assert.equal(r.error,undefined);assert.equal(r.presented,1);
 for(const marker of ['YOS 日記','今日の流れ','心に残ったこと','今日の記録','今日の気分','storyReview','書き終えた','今日の写真','未登録'])assert.ok(r.html.includes(marker),marker);
 assert.match(r.html,/overflow:hidden/);
 assert.doesNotMatch(r.html,/https?:\/\/[^" ]+\.jpg|Nov\. 18/);
});
test('calendar and Notion are read-only, completed items not inferred from future plans',async()=>{
 const r=await open({calendar:[{title:'出勤',startDate:new Date('2026-11-13T17:00:00+09:00'),isAllDay:false}],tasks:[task('資料整理'),task('準備','2026-11-13T09:00:00+09:00','次にやる')]});
 assert.equal(r.error,undefined);
 assert.equal(r.requests.length,1);
 assert.equal(r.requests[0].method,'POST');assert.equal(r.requests[0].body.filter.and[1].date.before,'2026-11-14');
 assert.match(r.html,/資料整理/);assert.match(r.html,/出勤/);assert.match(r.html,/準備/);
 assert.ok(!r.requests.some(x=>/pages$/.test(x.url)));
});
test('review and optional mood reach existing bridge without changing original answer',async()=>{
 const r=await open({choice:0,review:'今日の記録を修正',mood:'穏やか',input:{story:'元の物語',diary:'【今日の物語】\n元の物語\n【回答】元の言葉'}});
 assert.equal(r.error,undefined);assert.equal(r.opened.length,1);
 const url=new URL(r.opened[0]);const diary=Buffer.from(url.searchParams.get('diary'),'base64').toString();
 assert.match(diary,/今日の記録を修正/);assert.match(diary,/【今日の気分】穏やか/);
 assert.equal(Buffer.from(url.searchParams.get('answer'),'base64').toString(),'原文');
});
test('if event access fails, show not retrieved instead of invented daily history',async()=>{
 const r=await open({auth:false,calendar:[]});assert.equal(r.error,undefined);
 assert.match(r.html,/予定・完了記録はありません/);assert.equal(r.requests.length,0);
});
test('the source and Scriptable distribution copy are identical after metadata header',()=>{
 const shipped=fs.readFileSync(new URL('../../../ios-app/scriptable/YOS Journal Book.js',import.meta.url),'utf8');assert.ok(shipped.endsWith(source));
});

test('compose mode opens with real calendar/Notion context and no fabricated pre-filled journal text',async()=>{
 const r=await open({mode:'compose',review:'今日は友人と話せて嬉しかった',calendar:[{title:'買い物',startDate:new Date('2026-11-13T13:00:00+09:00'),isAllDay:false}],tasks:[task('片付け')]});
 assert.equal(r.error,undefined);assert.equal(r.presented,1);
 assert.match(r.html,/買い物/);assert.match(r.html,/片付け/);
 assert.match(r.html,/mode\\":\\"compose/);
 assert.equal(r.opened.length,1);
 assert.equal(r.backups.length,1);
 assert.ok(r.opened[0].startsWith('shortcuts://run-shortcut?'));
 const u=new URL(r.opened[0]);
 assert.equal(u.searchParams.get('name'),'YOS 日記');
 assert.equal(u.searchParams.get('input'),'text');
 assert.equal(u.searchParams.get('text'),'YOS_JOURNAL_COMPOSE_V1:今日は友人と話せて嬉しかった');
});
test('unfinished/empty compose never triggers AI callback or Notion write',async()=>{
 for(const option of [{finished:false,review:'話した'}, {review:''}, {fileWriteFails:true,review:'話した'}]){
  const r=await open({mode:'compose',...option});
  assert.equal(r.opened.length,0);assert.equal(r.requests.filter(x=>x.method==='PATCH').length,0);
 }
});
test('compose mode refuses oversized URL and preserves the raw backup locally',async()=>{
 const r=await open({mode:'compose',review:'気'.repeat(501)});
 assert.equal(r.opened.length,0);assert.equal(r.backups.length,1);
});
test('closing review without clicking printed-finish never saves',async()=>{
 const r=await open({finished:false,choice:0});assert.equal(r.opened.length,0);
});
