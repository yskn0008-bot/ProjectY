import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNotificationHandler} from '../dist/intake/notification-handler.js';

const token='existing-clarity-test-token-123456';
const tokenSha256=createHash('sha256').update(token).digest('hex');
const page='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const API='https://example.test/api/yos/notification';
const NOW=new Date('2026-11-07T01:00:00.000Z');

function harness(viewerAuth){
  const memory=new Map(),blocks=[],calls=[];
  const state={failPatch:false,ambiguous:false,failGet:false,failRedis:false,replaceLockDuringPatch:false};
  const redis={async command(args){
    if(state.failRedis)throw new Error('Redis unavailable');
    const [op,key,value]=args;
    if(op==='SET'&&args.includes('NX')){
      if(memory.has(key))return null;
      memory.set(key,value);return 'OK';
    }
    if(op==='SET'){memory.set(key,value);return 'OK'}
    if(op==='GET')return memory.get(key)??null;
    if(op==='DEL')return memory.delete(key)?1:0;
    if(op==='EVAL'){const lock=args[3],owner=args[4];if(memory.get(lock)!==owner)return 0;return memory.delete(lock)?1:0;}
    throw Error('Unexpected redis operation: '+op);
  }};
  async function fetchImpl(url,init={}){
    calls.push({url,method:init.method??'GET'});
    if(state.failGet&&init.method==='GET')throw Error('Notion GET unavailable');
    if(init.method==='GET')
      return new Response(JSON.stringify({results:blocks,has_more:false,next_cursor:null}),{status:200});
    if(init.method==='PATCH'){
      if(state.replaceLockDuringPatch){const lock=[...memory.keys()].find(k=>k.endsWith(':lock'));if(lock)memory.set(lock,'new-owner-after-expiry')}
      const list=JSON.parse(init.body).children;
      if(!state.failPatch||state.ambiguous){
        for(const item of list)blocks.push({...item,id:'block-'+blocks.length});
      }
      if(state.failPatch)throw Error('HTTP response lost');
      return new Response(JSON.stringify({results:list.map((_,i)=>({id:'block-'+i}))}),{status:200});
    }
    throw Error('Unexpected request '+init.method);
  }
  const handler=createNotificationHandler({
    tokenSha256,notionToken:'notion-test-secret',notionPageId:page,redis,
    fetchImpl,now:()=>NOW,
    ...(viewerAuth?{viewerAuth}:{})
  });
  const req=(body,auth='Bearer '+token,method='POST')=>new Request(API,{
    method,headers:{Authorization:auth,'Content-Type':'application/json'},
    ...(body===null?{}:{body:JSON.stringify(body)})
  });
  return {handler,req,state,blocks,memory,calls};
}

test('native notification saves to existing Inbox and categorizes missed call',async()=>{
  const h=harness(),r=await h.handler(h.req({
    text:'電話：不在着信が1件あります',sourceApp:'電話',eventId:'native-unique-0001'
  }));
  assert.equal(r.status,201);
  const data=await r.json();
  assert.equal(data.ok,true);
  assert.equal(data.category,'missed-call');
  assert.equal(data.decision,'YOS_SILENT');
  assert.equal(data.alertText,'');
  assert.equal(h.blocks.length,1);
  assert.match(JSON.stringify(h.blocks),/Native Notification/);
  assert.doesNotMatch(JSON.stringify(h.blocks),/notion-test-secret/);
});

test('same eventId is idempotent with no second Notion fetch',async()=>{
  const h=harness(),input={text:'PayPayからのお知らせ 800円',eventId:'native-unique-0002',sourceApp:'PayPay'};
  const a=await h.handler(h.req(input)),before=h.calls.length;
  const b=await h.handler(h.req(input));
  assert.equal(a.status,201);assert.equal(b.status,200);
  assert.equal((await b.json()).duplicate,true);
  assert.equal(h.blocks.length,1);assert.equal(h.calls.length,before);
});

test('duplicate intake does not remove a lock owned by a concurrent request',async()=>{
  const h=harness(),eventId='native-concurrent-locked-1';
  const id=createHash('sha256').update('id:iPhone通知:'+eventId).digest('hex').slice(0,24);
  const key='yos:notification:inbox:v1:'+id+':lock';
  h.memory.set(key,'existing-worker');
  const response=await h.handler(h.req({text:'重複受信の模擬',eventId}));
  assert.equal(response.status,409);
  assert.equal(h.memory.get(key),'existing-worker');
  assert.equal(h.blocks.length,0);
});

test('expired lock replaced by another owner is not deleted',async()=>{
  const h=harness(),eventId='native-expired-locked-2';
  h.state.replaceLockDuringPatch=true;
  const response=await h.handler(h.req({text:'保存処理の模擬',eventId}));
  assert.equal(response.status,201);
  const id=createHash('sha256').update('id:iPhone通知:'+eventId).digest('hex').slice(0,24);
  assert.equal(h.memory.get('yos:notification:inbox:v1:'+id+':lock'),'new-owner-after-expiry');
  assert.equal(h.blocks.length,1);
});

test('lost PATCH acknowledgement reconciles before retry',async()=>{
  const h=harness(),input={text:'引落失敗 800円',eventId:'native-unique-0003'};
  h.state.failPatch=true;h.state.ambiguous=true;
  const first=await h.handler(h.req(input));
  assert.equal(first.status,503);assert.equal(h.blocks.length,1);
  h.state.failPatch=false;h.state.ambiguous=false;
  const second=await h.handler(h.req(input));
  assert.equal(second.status,200);assert.equal((await second.json()).duplicate,true);
  assert.equal(h.blocks.length,1);assert.ok(h.calls.some(x=>x.method==='GET'));
});

test('unreachable Notion during uncertain retry preserves pending state',async()=>{
  const h=harness(),input={text:'銀行 引落失敗',eventId:'native-unique-0004'};
  h.state.failPatch=true;h.state.ambiguous=true;
  assert.equal((await h.handler(h.req(input))).status,503);
  h.state.failPatch=false;h.state.failGet=true;
  assert.equal((await h.handler(h.req(input))).status,503);assert.equal(h.blocks.length,1);
});

test('rejects invalid authorization before any storage use',async()=>{
  const h=harness();
  const r=await h.handler(h.req({text:'未承認'},'Bearer wrong-token-value-123456'));
  assert.equal(r.status,401);assert.equal(h.calls.length,0);assert.equal(h.memory.size,0);
  assert.equal((await h.handler(h.req(null,'','GET'))).status,401);
});

test('body type, size, date validated',async()=>{
  const h=harness();
  assert.equal((await h.handler(h.req({text:''}))).status,400);
  assert.equal((await h.handler(h.req({text:'x',occurredAt:'no'}))).status,400);
  assert.equal((await h.handler(h.req({text:'x'.repeat(5000)}))).status,400);
  assert.equal(h.blocks.length,0);
});

test('authentication codes not echoed or stored',async()=>{
  const h=harness(),r=await h.handler(h.req({text:'ログインの認証コード: 987654',eventId:'native-unique-0005'}));
  const obj=await r.json();
  assert.equal(obj.decision,'YOS_SILENT');assert.equal(obj.alertText,'');
  assert.doesNotMatch(JSON.stringify(h.blocks),/987654/);
});

test('test notifications and ordinary reminders remain silent',async()=>{
  const h=harness();
  const a=await h.handler(h.req({text:'【通知テスト｜重要】今すぐ確認してください',eventId:'native-unique-0006'}));
  assert.equal((await a.json()).decision,'YOS_SILENT');
  const b=await h.handler(h.req({text:'リマインダー　音楽を聴く',eventId:'native-unique-0007'}));
  assert.equal((await b.json()).decision,'YOS_SILENT');
});

test('high risk text produces grounded action',async()=>{
  const h=harness(),r=await h.handler(h.req({text:'銀行：口座凍結が発生しました',eventId:'native-unique-0008'}));
  const obj=await r.json();
  assert.equal(obj.decision,'YOS_ALERT');
  assert.match(obj.alertText,/元アプリを開き、事実と期限を確認/);
  assert.match(obj.alertText,/【YOS重要｜P0】/);
});

test('Inbox exposes an authenticated history with statuses',async()=>{
  const h=harness(),input={text:'不在着信を受けました',sourceApp:'電話',eventId:'native-unique-0009'};
  const created=await (await h.handler(h.req(input))).json();
  const before=await (await h.handler(h.req(null,undefined,'GET'))).json();
  assert.equal(before.events.length,1);
  assert.equal(before.events[0].status,'unread');
  assert.equal(before.events[0].id,created.id);
  const marked=await h.handler(h.req({action:'mark',id:created.id,status:'pending'}));
  assert.equal((await marked.json()).status,'pending');
  assert.equal(h.blocks.length,2);
  const after=await (await h.handler(h.req(null,undefined,'GET'))).json();
  assert.equal(after.events[0].status,'pending');
  assert.match(after.events[0].text,/不在着信/);
});

test('cannot mark absent event or invalid state',async()=>{
  const h=harness();
  assert.equal((await h.handler(h.req({action:'mark',id:'a'.repeat(24),status:'done'}))).status,404);
  assert.equal((await h.handler(h.req({action:'mark',id:'a'.repeat(24),status:'paid'}))).status,400);
  assert.equal(h.blocks.length,0);
});

test('Redis failure does not append untracked notifications',async()=>{
  const h=harness();h.state.failRedis=true;
  const r=await h.handler(h.req({text:'PayPay銀行通知',eventId:'native-unique-0010'}));
  assert.equal(r.status,503);assert.equal(h.blocks.length,0);
});

test('verified viewer can read and mark Inbox, but cannot submit device notifications',async()=>{
  const valid='sample-viewer-credential-0001';
  const h=harness(async value=>value===valid);
  const created=await (await h.handler(h.req({text:'不在着信',eventId:'native-unique-0020'}))).json();
  const auth='Bearer '+valid;
  assert.equal((await h.handler(h.req(null,auth,'GET'))).status,200);
  assert.equal((await h.handler(h.req({action:'mark',id:created.id,status:'read'},auth))).status,200);
  assert.equal((await h.handler(h.req({text:'ordinary message',eventId:'native-unique-0021'},auth))).status,403);
  assert.equal(h.blocks.length,2);
});

test('unverified viewer cannot read Inbox',async()=>{
  const h=harness(async()=>false);
  const r=await h.handler(h.req(null,'Bearer sample-unauthorized-credential-001','GET'));
  assert.equal(r.status,401);
  assert.equal(h.calls.length,0);
});

test('genuine urgency extracts the claimed amount and deadline without inventing current balance',async()=>{
  const h=harness();
  const r=await h.handler(h.req({text:'銀行からのお知らせ：引落失敗 8,200円。支払期限: 11月7日',eventId:'native-unique-0091'}));
  const obj=await r.json();
  assert.equal(obj.decision,'YOS_ALERT');
  assert.match(obj.alertText,/記載金額: 8,200円/);
  assert.match(obj.alertText,/記載期限: 支払期限: 11月7日/);
  assert.doesNotMatch(obj.alertText,/現在の残高は\d+/);
});

test('test text with dangerous words is still silent and does not repeat a fabricated alert',async()=>{
  const h=harness();
  const r=await h.handler(h.req({text:'これは架空の通知テスト：口座凍結',eventId:'native-unique-0092'}));
  const obj=await r.json();
  assert.equal(obj.decision,'YOS_SILENT');
  assert.equal(obj.alertText,'');
});
