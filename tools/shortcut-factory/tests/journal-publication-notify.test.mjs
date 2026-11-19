import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const code=await readFile(new URL('../journal_publication_notify_inline.js',import.meta.url),'utf8');
const TODAY='2026-11-20';
const sample=()=>({
  issuedOn:TODAY,date:'2026.11.20 / FRI',headline:'第一印象の研究から、新たな魅力の可能性を読み解く特集。',
  articles:[{title:'研究の結果を原典から見直す特集記事',link:'https://www.nature.com/articles/s41598-017-00526-9'}]
});
async function run({issue=sample(),offline=false,saveError=false,notifyError=false,previous=null,time='2026-11-20T00:00:00.000Z'}={}){
  let result,completed=0,requested=[],notes=[];
  const disk=new Map();if(previous)disk.set('/private/YOS JOURNAL Published Notification V1.json',JSON.stringify(previous));
  class Request{
    constructor(url){requested.push(url);this.url=url;}
    async loadJSON(){if(offline)throw Error('simulated network unavailable');this.response={statusCode:200};return issue;}
  }
  class Notification{
    constructor(){notes.push(this);}
    setTriggerDate(d){this.trigger=d;}
    async schedule(){if(notifyError)throw Error('not allowed');this.scheduled=true;}
  }
  const FileManager={local(){return{
    documentsDirectory(){return '/private';},
    joinPath(a,b){return a+'/'+b;},
    fileExists(p){return disk.has(p);},
    readString(p){return disk.get(p);},
    writeString(p,s){if(saveError)throw Error('disk error');disk.set(p,s);}
  };}};
  const FixedDate=class extends Date{
    constructor(...args){super(...(args.length?args:[time]));}
    static now(){return Date.parse(time);}
  };
  const Script={setShortcutOutput(x){result=x;},complete(){completed++;}};
  await new AsyncFunction('Request','Notification','FileManager','Script','Date',code)(Request,Notification,FileManager,Script,FixedDate);
  return {result,completed,requested,notes,disk};
}
test('notifies only publicly issued edition of current JST day',async()=>{
  const r=await run();
  assert.equal(r.result,'YOS_JOURNAL_NOTIFY_SCHEDULED');
  assert.equal(r.completed,1);
  assert.equal(r.notes.length,1);
  assert.equal(r.notes[0].scheduled,true);
  assert.equal(r.notes[0].openURL,'https://yskn0008-bot.github.io/ProjectY/journal-v2/');
  assert.ok(r.disk.has('/private/YOS JOURNAL Published Notification V1.json'));
  assert.equal(r.requested.length,1);
  assert.match(r.requested[0],/^https:\/\/raw\.githubusercontent\.com\/yskn0008-bot\/ProjectY\/main\/ios-app\/scriptable\/journal\/latest\.json/);
});
test('never notifies on yesterday/empty/malformed issue',async()=>{
 for(const issue of [{...sample(),issuedOn:'2026-11-19'}, {...sample(),articles:[]}, {...sample(),headline:'short'}, null]){
   const r=await run({issue});
   assert.match(r.result,/HOLD:NO_CURRENT_PUBLIC_ISSUE/);
   assert.equal(r.notes.length,0);
 }
});
test('today means JST and is not a UTC calendar day',async()=>{
 const r=await run({time:'2026-11-19T15:07:00.000Z'});
 assert.equal(r.result,'YOS_JOURNAL_NOTIFY_SCHEDULED');
 const yesterday=await run({time:'2026-11-19T14:59:00.000Z'});
 assert.match(yesterday.result,/HOLD:NO_CURRENT_PUBLIC_ISSUE/);
});
test('prevents duplicate notification from same published date',async()=>{
 const r=await run({previous:{date:TODAY,issuedAt:'2026-11-20T00:01:00Z'}});
 assert.equal(r.result,'YOS_JOURNAL_NOTIFY_ALREADY_SENT');
 assert.equal(r.notes.length,0);
});
test('blocks public-issue payload that accidentally contains private markers',async()=>{
 const issue=sample();issue.articles[0].summary='個人の残高';
 const r=await run({issue});assert.match(r.result,/HOLD/);assert.equal(r.notes.length,0);
});
test('fails closed offline or notification permission denied',async()=>{
 for(const opt of [{offline:true},{notifyError:true}]){
  const r=await run(opt);
  assert.match(r.result,/HOLD:ERROR/);assert.equal(r.completed,1);
  assert.equal(r.disk.size,0);
 }
});
test('does not claim delivery when local dedupe state cannot be saved',async()=>{
 const r=await run({saveError:true});
 assert.match(r.result,/HOLD:ERROR/);
 assert.equal(r.notes.length,1);
 assert.equal(r.notes[0].scheduled,true);
});
