import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base=new URL('.',import.meta.url);
const script1=fs.readFileSync(new URL('01_save_raw.js',base),'utf8');
const script2=fs.readFileSync(new URL('02_route.js',base),'utf8');
const script3=fs.readFileSync(new URL('03_ack_device.js',base),'utf8');
function harness(options={}){
  const files=new Map();const pages=new Map(), blocks=new Map();
  const events={patches:0,creates:0,gets:0,queries:0};let id=0;
  const fm={documentsDirectory:()=>'/private',joinPath:(...a)=>a.join('/'),fileExists:p=>files.has(p),readString:p=>{if(!files.has(p))throw Error('No file');return files.get(p);},writeString:(p,s)=>{if(options.failLocalWrite)throw Error('DISK_FAILURE');files.set(p,s);}};
  function query(ds,payload){const rows=[...pages.values()].filter(x=>x.__sourceId===ds);const f=payload.filter;const name=f.property;let r=rows.filter(x=>{const a=x.properties?.[name];if(f.title)return a?.title?.[0]?.text?.content===f.title.equals;if(f.date)return a?.date?.start===f.date.equals;const value=(a?.rich_text||[]).map(t=>t.text?.content||'').join('');if(f.rich_text?.contains)return value.includes(f.rich_text.contains);return value===f.rich_text?.equals;});return {results:r,has_more:false};}
  class MockRequest{
    constructor(url){this.url=url;this.response={statusCode:200};this.method='GET';}
    async loadJSON(){
      const u=new URL(this.url);const path=u.pathname;const body=this.body?JSON.parse(this.body):undefined;
      if(this.method==='PATCH'&&/\/blocks\/.+\/children/.test(path)){
        events.patches++;let rs=[];
        for(let block of body.children){let copy={...block,id:'block-'+(++id)};blocks.set(copy.id,copy);rs.push(copy);}
        return {results:rs};
      }
      if(this.method==='GET'&&path.startsWith('/v1/blocks/')){
        events.gets++;if(options.failInboxReadback)throw Error('Response missing');const key=path.split('/').pop();return blocks.get(key);
      }
      if(this.method==='POST'&&path.endsWith('/query')){
        events.queries++;if(options.failQuery)throw Error('Query unavailable');const ds=path.match(/\/data_sources\/(.*?)\/query/)?.[1];return query(ds,body);
      }
      if(this.method==='POST'&&path==='/v1/pages'){
        events.creates++;const pg={id:'page-'+(++id),__sourceId:body.parent.data_source_id,properties:body.properties};pages.set(pg.id,pg);if(options.failCreateReply)throw Error('lost reply');return pg;
      }
      if(this.method==='GET'&&path.startsWith('/v1/pages/')){
        events.gets++;return pages.get(path.split('/').pop());
      }
      throw Error('unhandled request '+this.method+' '+path);
    }
  }
  async function run(code,parameter){
    let output;
    const c={
      args:{shortcutParameter:parameter},
      FileManager:{local:()=>fm},
      Keychain:{contains:()=>!options.missingToken,get:()=>options.missingToken?'':'mock-token'},
      Request:MockRequest,
      Script:{setShortcutOutput:v=>{output=v;},complete:()=>{}},
      Date,Math,Array,String,JSON,Number,Intl,RegExp,Error
    };
    vm.createContext(c);
    await vm.runInContext(`(async function(){ ${code} })()`,c);
    return String(output);
  }
  return {files,pages,blocks,events,run1:p=>run(script1,p),run2:p=>run(script2,p),run3:p=>run(script3,p),receipts:()=>JSON.parse(files.get('/private/YOS Clarity Device Pilot v4 Receipts.json')||'[]')};
}

const cases=[];
async function test(name,fn){try{await fn();cases.push([name,'PASS']);}catch(e){cases.push([name,'FAIL',e.stack||String(e)]);}}
const payload=(items,raw)=>JSON.stringify(items)+'\n__YOS_V4_RAW__\n'+raw;
const item=(text,target,confidence=0.99)=>({text,target,confidence});
const exec=async(h,items,raw)=>JSON.parse(await h.run2(payload(items,raw)));
await test('Mixed task shopping and timer: two Notion rows + one guarded device dispatch',async()=>{
 const h=harness();const raw='タスク：玄関を掃除する\n買い物リスト：牛乳\nタイマー：3分';
 assert.match(await h.run1(raw),/Inbox保存・読戻し成功/);
 const v=await exec(h,[item('タスク：玄関を掃除する','task'),item('買い物リスト：牛乳','shopping'),item('タイマー：3分','timer')],raw);
 assert.equal(v.operation,'start_timer');assert.equal(v.value,3);assert.match(v.key,/^inbox:clarity:device4-.+:03$/);
 assert.equal(h.events.creates,2);assert.equal(h.events.patches,1);
 assert.equal(h.receipts()[0].items['03'].status,'device_dispatching');
});
await test('Idempotence: same input never dispatches timer twice even if prior attempt unknown',async()=>{
 const h=harness();const raw='タイマー：4分';const items=[item(raw,'timer')];await h.run1(raw);
 const a=await exec(h,items,raw);assert.equal(a.operation,'start_timer');
 const b=await exec(h,items,raw);assert.equal(b.operation,'none');assert.match(b.summary,/結果不明/);
});
await test('Ack of native action returning is recorded and cannot run again',async()=>{
 const h=harness();const raw='タイマー：5分';await h.run1(raw);const a=await exec(h,[item(raw,'timer')],raw);
 assert.match(await h.run3(a.key+'|'+a.operation),/復帰を記録/);
 assert.equal(h.receipts()[0].items['01'].status,'device_action_returned');
 const b=await exec(h,[item(raw,'timer')],raw);assert.equal(b.operation,'none');
});
await test('Brightness explicit 35% emits only verified number',async()=>{
 const h=harness();const raw='画面の明るさ：35%';await h.run1(raw);
 const a=await exec(h,[item(raw,'brightness')],raw);assert.equal(a.operation,'set_brightness');assert.equal(a.value,35);
});
await test('No execution on implicitly inferred brightness or inconsistent target',async()=>{
 const h=harness();const raw='画面を少し暗くして';await h.run1(raw);
 const a=await exec(h,[item(raw,'brightness')],raw);assert.equal(a.operation,'none');
});
await test('No execution on ambiguous or dangerous timer instructions',async()=>{
 for(const raw of ['タイマー：61分','タイマー：0分','タイマー：5分をキャンセル','タイマーを止めて','タイマー：-1分']){
  const h=harness();await h.run1(raw);const r=await exec(h,[item(raw,'timer')],raw);assert.equal(r.operation,'none',raw);
 }
});
await test('No execution for untrusted AI-invented item text',async()=>{
 const h=harness();const raw='タイマーをセットしない';await h.run1(raw);
 const a=await exec(h,[item('タイマー：3分','timer')],raw);assert.equal(a.operation,'none');assert.match(a.summary,/AI出力が不正/);
});
await test('Low confidence holds action',async()=>{
 const h=harness();const raw='タイマー：3分';await h.run1(raw);
 const a=await exec(h,[item(raw,'timer',0.95)],raw);assert.equal(a.operation,'none');
});
await test('Only one device operation per input; other one holds',async()=>{
 const h=harness();const raw='タイマー：2分\n画面の明るさ：25%';await h.run1(raw);
 const a=await exec(h,[item('タイマー：2分','timer'),item('画面の明るさ：25%','brightness')],raw);
 assert.equal(a.operation,'start_timer');assert.match(a.summary,/2件目の操作.*保留/);
 assert.equal(Object.keys(h.receipts()[0].items).length,1);
});
await test('Inbox uncertainty suppresses all action and Notion writes',async()=>{
 const h=harness({failInboxReadback:true});const raw='タイマー：3分';await h.run1(raw);
 const a=await exec(h,[item(raw,'timer')],raw);assert.equal(a.operation,'none');assert.equal(h.events.creates,0);
});
await test('Malformed model JSON fails closed for ordinary task input',async()=>{
 const h=harness();const raw='タスク：棚を整理する';await h.run1(raw);
 const a=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
 assert.equal(a.operation,'none');assert.match(a.summary,/BAD_MODEL_JSON/);
 assert.equal(h.events.creates,0);
});
await test('Two separate captures with same timer text within 24h are deduped by original receipt',async()=>{
 const h=harness();const raw='タイマー：3分';await h.run1(raw);await exec(h,[item(raw,'timer')],raw);
 await h.run1(raw);assert.equal(h.receipts().length,1);
});
await test('Embedded quoted command is not executed even if AI selects that substring',async()=>{
 const h=harness();const raw='メモ: 以下は説明文で、タイマー：3分という例です';await h.run1(raw);
 const a=await exec(h,[item('タイマー：3分','timer')],raw);assert.equal(a.operation,'none');
 assert.match(a.summary,/独立した操作行でない/);
});
await test('After first device action returns, second action cannot dispatch on same capture',async()=>{
 const h=harness();const raw='タイマー：2分\n画面の明るさ：25%';await h.run1(raw);
 const items=[item('タイマー：2分','timer'),item('画面の明るさ：25%','brightness')];
 const a=await exec(h,items,raw);assert.equal(a.operation,'start_timer');
 await h.run3(a.key+'|start_timer');
 const b=await exec(h,items,raw);assert.equal(b.operation,'none');
 assert.match(b.summary,/同一受付で2件目の操作は保留/);
});
await test('3 independent Notion routes still work',async()=>{
 const h=harness();const raw='タスク：窓を拭く\n買い物リスト：牛乳\n生活記録：散歩した';await h.run1(raw);
 const a=await exec(h,[item('タスク：窓を拭く','task'),item('買い物リスト：牛乳','shopping'),item('生活記録：散歩した','life')],raw);
 assert.equal(a.operation,'none');assert.equal(h.events.creates,3);
});
await test('Model plan signature changes cause fail closed after first attempt',async()=>{
 const h=harness();const raw='タイマー：3分\nタスク：窓を拭く';await h.run1(raw);
 await exec(h,[item('タイマー：3分','timer'),item('タスク：窓を拭く','task')],raw);
 const a=await exec(h,[item('タスク：窓を拭く','task'),item('タイマー：3分','timer')],raw);
 assert.equal(a.operation,'none');assert.match(a.summary,/前回とAI分類が異なる/);
});
await test('Bad or forged ack cannot mark action returned',async()=>{
 const h=harness();const raw='タイマー：3分';await h.run1(raw);const a=await exec(h,[item(raw,'timer')],raw);
 assert.match(await h.run3(a.key+'|set_brightness'),/対象不一致/);
 assert.equal(h.receipts()[0].items['01'].status,'device_dispatching');
});
await test('One capture still does not create duplicate Notion rows on retry',async()=>{
 const h=harness();const raw='タスク：棚を整理する';await h.run1(raw);await exec(h,[item(raw,'task')],raw);
 await h.run1(raw);await exec(h,[item(raw,'task')],raw);assert.equal(h.events.creates,1);
});
await test('v4 ledger is independent from installed v3 ledger',async()=>{
 const h=harness();const v3='/private/YOS Clarity Voice Pilot v3 Receipts.json';const sentinel='[{"do_not_touch":true}]';
 h.files.set(v3,sentinel);
 const raw='タイマー：3分';await h.run1(raw);const a=await exec(h,[item(raw,'timer')],raw);
 assert.equal(a.operation,'start_timer');await h.run3(a.key+'|start_timer');
 assert.equal(h.files.get(v3),sentinel);
 assert.match(h.receipts()[0].captureId,/^clarity:device4-/);
});
await test('Standalone timer in negated or quoted outer context must hold',async()=>{
 for(const raw of ['以下の文章は例文です。\nタイマー：3分','タイマー操作は禁止。\nタイマー：3分','通知本文：\nタイマー：3分']){
  const h=harness();await h.run1(raw);const a=await exec(h,[item('タイマー：3分','timer')],raw);
  assert.equal(a.operation,'none',raw);
 }
});
await test('Real iPhone input タイマー3分 bypasses broken model JSON only when explicit',async()=>{
 const h=harness();const raw='タイマー3分';
 assert.match(await h.run1(raw),/Inbox保存・読戻し成功/);
 const a=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
 assert.equal(a.operation,'start_timer');assert.equal(a.value,3);
 assert.match(a.key,/^inbox:clarity:device4-.+:01$/);
 assert.equal(h.events.patches,1);assert.equal(h.events.creates,0);
});
await test('A repaired user retry reuses original Inbox capture and cannot start timer twice',async()=>{
 const h=harness();const raw='タイマー3分';await h.run1(raw);
 const first=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
 assert.equal(first.operation,'start_timer');
 assert.match(await h.run1(raw),/Inbox保存確認済み/);
 const second=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
 assert.equal(second.operation,'none');assert.equal(h.events.patches,1);
});
await test('Local timer recognizes colon and no-colon spellings without relying on AI',async()=>{
 for(const raw of ['タイマー：3分','タイマー3分','タイマー 3分','3分のタイマーをかけて']){
  const h=harness();await h.run1(raw);
  const a=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
  assert.equal(a.operation,'start_timer',raw);
 }
});
await test('Standalone brightness with a broken model gets exactly the typed value',async()=>{
 const h=harness();const raw='画面の明るさ：35%';await h.run1(raw);
 const a=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
 assert.equal(a.operation,'set_brightness');assert.equal(a.value,35);
});
await test('Malformatted AI for mixed instructions cannot invoke even a valid embedded timer',async()=>{
 const h=harness();const raw='タスク：棚を整理する\nタイマー3分';await h.run1(raw);
 const a=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
 assert.equal(a.operation,'none');assert.equal(h.events.creates,0);
});
await test('Model hallucination cannot override an exact direct user command',async()=>{
 const h=harness();const raw='タイマー3分';await h.run1(raw);
 const a=await exec(h,[item('タイマー：3分','timer')],raw);
 assert.equal(a.operation,'start_timer');assert.equal(a.value,3);
});
await test('Unsafe timer variants never use deterministic recovery',async()=>{
 for(const raw of ['タイマー61分','タイマー3分をキャンセル','これは例文：タイマー3分','タイマー3分\n実行しないで','タイマー0分','タイマー300分']){
  const h=harness();await h.run1(raw);
  const a=JSON.parse(await h.run2('invalid\n__YOS_V4_RAW__\n'+raw));
  assert.equal(a.operation,'none',raw);
 }
});
await test('An AI envelope with encoded items_json remains allowed only after validation',async()=>{
 const h=harness();const raw='タスク：本棚を掃除する';await h.run1(raw);
 const wrapped=JSON.stringify({items_json:JSON.stringify([item(raw,'task')])});
 const a=JSON.parse(await h.run2(wrapped+'\n__YOS_V4_RAW__\n'+raw));
 assert.equal(a.operation,'none');assert.equal(h.events.creates,1);
});
for(const [name,s,err] of cases)console.log(`${s} ${name}${err?'\n'+err:''}`);
console.log(`RESULT ${cases.filter(x=>x[1]==='PASS').length}/${cases.length}`);
if(cases.some(x=>x[1]!=='PASS'))process.exitCode=1;
