import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNotificationHandler,notificationInternals} from '../dist/intake/notification-handler.js';

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

test('ChatGPT mode saves before analysis and exposes pending state without a second notification',async()=>{
  const h=harness(),input={text:'銀行：引落失敗 800円',eventId:'ai-mode-00000001',decisionEngine:'chatgpt'};
  const first=await (await h.handler(h.req(input))).json();
  assert.equal(first.aiState,'pending');
  assert.equal(first.decision,'YOS_SILENT');
  assert.equal(first.analysisText,'銀行：引落失敗 800円');
  assert.equal(h.blocks.length,1);
  const history=await (await h.handler(h.req(null,undefined,'GET'))).json();
  assert.equal(history.events[0].aiState,'pending');
  assert.match(history.events[0].text,/引落失敗/);
  assert.doesNotMatch(history.events[0].text,/ai-pending/);
  const duplicate=await (await h.handler(h.req(input))).json();
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.analysisText,first.analysisText);
  assert.equal(h.blocks.length,1);
});

test('ChatGPT capture returns only redacted text for a mixed incident and OTP',async()=>{
  const h=harness(),input={text:'銀行：不正送金を検知。認証コード 123456',sourceApp:'銀行',
    eventId:'ai-mode-mixed-secret-01',decisionEngine:'chatgpt'};
  const first=await (await h.handler(h.req(input))).json();
  assert.equal(first.aiState,'pending');
  assert.match(first.analysisText,/不正送金/);
  assert.doesNotMatch(JSON.stringify(first)+JSON.stringify(h.blocks),/123456/);
  const repeated=await (await h.handler(h.req(input))).json();
  assert.equal(repeated.analysisText,first.analysisText);
  assert.doesNotMatch(JSON.stringify(repeated),/123456/);
});

test('failed AI result can be safely retried with the same ID and acknowledged',async()=>{
  const h=harness();
  const capture=await (await h.handler(h.req({text:'不正送金を検知',eventId:'ai-mode-00000002',decisionEngine:'chatgpt'}))).json();
  assert.equal((await h.handler(h.req({action:'ai-result',id:capture.id,decision:'failed'}))).status,201);
  assert.equal((await (await h.handler(h.req(null,undefined,'GET'))).json()).events[0].aiState,'failed');
  assert.equal((await (await h.handler(h.req({action:'ai-result',id:capture.id,decision:'failed'}))).json()).duplicate,true);
  const outcome={action:'ai-result',id:capture.id,decision:'YOS_ALERT',summary:'不正送金を検知しました'};
  const saved=await (await h.handler(h.req(outcome))).json();
  assert.equal(saved.aiState,'complete');assert.equal(saved.alertRequiresAck,true);
  const repeated=await (await h.handler(h.req(outcome))).json();
  assert.equal(repeated.duplicate,true);assert.equal(repeated.decision,'YOS_ALERT');
  const captureAgain=await (await h.handler(h.req({text:'不正送金を検知',eventId:'ai-mode-00000002',decisionEngine:'chatgpt'}))).json();
  assert.equal(captureAgain.aiState,'complete');
  assert.equal(captureAgain.decision,'YOS_SILENT','capture retry never creates a second AI alert');
  assert.equal(h.blocks.length,3,'capture, failed and final result only');
  assert.equal((await (await h.handler(h.req(null,undefined,'GET'))).json()).events[0].aiDecision,'YOS_ALERT');
  await h.handler(h.req({action:'ack-alert',id:capture.id}));
  assert.equal((await (await h.handler(h.req(outcome))).json()).decision,'YOS_SILENT');
  assert.equal((await h.handler(h.req({...outcome,decision:'YOS_SILENT'}))).status,409);
});

test('ambiguous AI result append is reconciled before retry; secrets are redacted',async()=>{
  const h=harness();
  const capture=await (await h.handler(h.req({text:'銀行：不正送金、認証コード: 123456',eventId:'ai-mode-00000003',decisionEngine:'chatgpt'}))).json();
  const outcome={action:'ai-result',id:capture.id,decision:'YOS_ALERT',summary:'不正送金を検知。認証コード: 123456'};
  h.state.failPatch=true;h.state.ambiguous=true;
  assert.equal((await h.handler(h.req(outcome))).status,503);
  h.state.failPatch=false;h.state.ambiguous=false;
  const retry=await (await h.handler(h.req(outcome))).json();
  assert.equal(retry.duplicate,true);assert.equal(retry.decision,'YOS_ALERT');
  assert.equal(h.blocks.length,2);
  assert.doesNotMatch(JSON.stringify(h.blocks)+JSON.stringify(retry),/123456/);
});

test('viewer and unconfirmed ID cannot register AI results',async()=>{
  const h=harness(async value=>value==='sample-viewer-credential-0003');
  const input={action:'ai-result',id:'a'.repeat(24),decision:'YOS_SILENT'};
  assert.equal((await h.handler(h.req(input,'Bearer sample-viewer-credential-0003'))).status,403);
  assert.equal((await h.handler(h.req(input))).status,409);
  assert.equal(h.blocks.length,0);
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

test('amount field cannot reintroduce a redacted code in a mixed critical alert',async()=>{
  const h=harness(),r=await h.handler(h.req({
    text:'銀行：不正送金を検知。認証コード 123456円。被害額8,200円',eventId:'mixed-amount-secret-01'
  }));
  const data=await r.json();
  assert.equal(data.decision,'YOS_ALERT');
  assert.match(data.alertText,/記載金額: 8,200円/);
  assert.doesNotMatch(data.alertText+JSON.stringify(h.blocks),/123456/);
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

test('authenticated history paginates beyond 120 and searches older Inbox records',async()=>{
  const h=harness();
  for(let i=0;i<125;i++){
    const id=i.toString(16).padStart(24,'0');
    const text=`2026-11-07T00:${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}.000Z · Native Notification · notification:${id} · information\n`+
      (i===0?'古い重要な検索対象':'通常のお知らせ')+'\n---';
    h.blocks.push({id:'block-'+i,type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:text}}]}});
  }
  const get=path=>h.handler(new Request(API+path,{headers:{Authorization:'Bearer '+token}}));
  const first=await (await get('')).json();
  assert.equal(first.events.length,120);
  assert.equal(first.totalMatched,125);
  assert.equal(first.hasMore,true);
  const second=await (await get('?cursor='+first.nextCursor)).json();
  assert.equal(second.events.length,5);
  assert.equal(second.hasMore,false);
  assert.equal(second.nextCursor,null);
  assert.match(second.events[4].text,/古い重要な検索対象/);
  const searched=await (await get('?q='+encodeURIComponent('古い重要な検索対象'))).json();
  assert.equal(searched.events.length,1);
  assert.equal(searched.events[0].id,'0'.repeat(24));
  assert.equal(searched.totalMatched,1);
  const olderId='0'.repeat(24);
  const marked=await h.handler(h.req({action:'mark',id:olderId,status:'pending'}));
  assert.equal(marked.status,200);
  const targeted=await (await get('?id='+olderId)).json();
  assert.equal(targeted.event.id,olderId);
  assert.equal(targeted.event.status,'pending');
  assert.equal(targeted.complete,true);
  assert.equal((await get('?id='+'f'.repeat(24))).status,404);
  assert.equal((await get('?id='+olderId+'&cursor='+first.nextCursor)).status,400);
  assert.equal((await get('?id='+olderId+'&q=対象')).status,400);
  assert.equal((await get('?id=wrong')).status,400);
  assert.equal(h.blocks.length,126,'targeted read must not write beyond the explicit status update');
  assert.equal((await get('?cursor='+'f'.repeat(24))).status,400);
  assert.equal((await get('?q='+'x'.repeat(81))).status,400);
});

test('legacy Clarity Notification records are readable without rewriting existing Inbox blocks',async()=>{
  const h=harness();
  const legacyId='cc82f767';
  const legacyText='2026-10-21T10:32:45.803Z · Clarity Notification · notification:'+legacyId+' · money-review\n発信元: テスト用銀行\n支払予定の案内\n---';
  h.blocks.push({
    id:'legacy-original-block',
    type:'paragraph',
    paragraph:{rich_text:[{type:'text',text:{content:legacyText}}]}
  });
  const before=h.blocks.length;
  const response=await h.handler(h.req(null,undefined,'GET'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.events.length,1);
  assert.equal(data.events[0].id,legacyId);
  assert.equal(data.events[0].category,'money-review');
  assert.equal(data.events[0].status,'unread');
  assert.match(data.events[0].text,/支払予定の案内/);
  assert.equal(h.blocks.length,before,'reading legacy history must not write or rewrite original blocks');
  const result=await h.handler(h.req({action:'mark',id:legacyId,status:'pending'}));
  assert.equal(result.status,200);
  assert.equal(h.blocks.length,before+1,'state update must append without replacing the original block');
  assert.equal(h.blocks[0].id,'legacy-original-block');
  const after=await (await h.handler(h.req(null,undefined,'GET'))).json();
  assert.equal(after.events[0].status,'pending');
});

test('old Clarity missed calls appear under the missed-call filter without rewriting Inbox',async()=>{
  const h=harness();
  const rows=[
    {id:'aabbccdd', category:'information', text:'電話\\n東京都\\n不在着信'},
    {id:'eeff0011', category:'information', text:'不在着信の設定方法を説明します'}
  ];
  for(const [index,row] of rows.entries()){
    const record='2026-10-26T08:00:0'+index+'.000Z · Clarity Notification · notification:'+
      row.id+' · '+row.category+'\\n'+row.text+'\\n---';
    h.blocks.push({id:'legacy-block-'+index,type:'paragraph',
      paragraph:{rich_text:[{type:'text',text:{content:record.replaceAll('\\n','\n')}}]}});
  }
  const before=JSON.stringify(h.blocks);
  const response=await h.handler(h.req(null,undefined,'GET'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.events.length,2);
  const missed=data.events.find(x=>x.id==='aabbccdd');
  const ordinary=data.events.find(x=>x.id==='eeff0011');
  assert.equal(missed.category,'missed-call');
  assert.equal(missed.source,'Clarity Notification');
  assert.equal(ordinary.category,'information','ordinary informational content must not become a missed call');
  assert.equal(JSON.stringify(h.blocks),before,'legacy classification must never rewrite original Inbox blocks');
  assert.equal(h.calls.filter(x=>x.method==='PATCH').length,0);
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


test('critical alert is replayed after a lost response until device acknowledges its display',async()=>{
  const h=harness(),input={text:'銀行からのお知らせ：口座凍結が発生しました',sourceApp:'銀行',eventId:'native-alert-recovery-0001'};
  const first=await (await h.handler(h.req(input))).json();
  assert.equal(first.decision,'YOS_ALERT');
  assert.equal(first.alertRequiresAck,true);
  assert.equal(h.blocks.length,1);
  // Simulate iPhone losing the first HTTP reply before it can show the alert.
  const replay=await (await h.handler(h.req(input))).json();
  assert.equal(replay.duplicate,true);
  assert.equal(replay.decision,'YOS_ALERT');
  assert.equal(replay.alertRequiresAck,true);
  assert.equal(replay.alertText,first.alertText);
  assert.equal(h.blocks.length,1,'replay must not duplicate Inbox records');
  // The device acknowledges only after the Shortcuts notification-display action.
  const ack=await h.handler(h.req({action:'ack-alert',id:first.id}));
  assert.equal(ack.status,200);
  assert.equal((await ack.json()).alertAcknowledged,true);
  const after=await (await h.handler(h.req(input))).json();
  assert.equal(after.decision,'YOS_SILENT');
  assert.equal(after.alertText,'');
  assert.equal(after.alertRequiresAck,false);
  assert.equal(h.blocks.length,1);
});

test('ambiguous Notion PATCH is reconciled before replaying a critical alert',async()=>{
  const h=harness(),input={text:'銀行：不正送金が検出されました',eventId:'native-alert-recovery-0002'};
  h.state.failPatch=true;h.state.ambiguous=true;
  const first=await h.handler(h.req(input));
  assert.equal(first.status,503);
  assert.equal(h.blocks.length,1);
  h.state.failPatch=false;h.state.ambiguous=false;
  const reply=await (await h.handler(h.req(input))).json();
  assert.equal(reply.duplicate,true);
  assert.equal(reply.decision,'YOS_ALERT');
  assert.equal(reply.alertRequiresAck,true);
  assert.match(reply.alertText,/不正送金/);
  assert.equal(h.blocks.length,1);
});

test('acknowledgement must come from device and only after Inbox save is confirmed',async()=>{
  const valid='sample-viewer-credential-0002';
  const h=harness(async value=>value===valid);
  const input={text:'口座凍結',eventId:'native-alert-recovery-0003'};
  const id=createHash('sha256').update('id:iPhone通知:'+input.eventId).digest('hex').slice(0,24);
  const before=h.handler(h.req({action:'ack-alert',id}));
  assert.equal((await before).status,409);
  await h.handler(h.req(input));
  assert.equal((await h.handler(h.req({action:'ack-alert',id},'Bearer '+valid))).status,403);
  const confirmed=await h.handler(h.req({action:'ack-alert',id}));
  assert.equal(confirmed.status,200);
  const twice=await h.handler(h.req({action:'ack-alert',id}));
  assert.equal(twice.status,200);
});

test('bank debit wording regression',()=>{
  for(const content of ['引き落としができませんでした','口座振替ができませんでした','引落しできず']){
    const category=notificationInternals.categoryOf(content);
    assert.equal(category,'money-review');
    assert.equal(notificationInternals.triage(content,category).decision,'YOS_ALERT');
  }
  const success='口座振替が正常に完了しました';
  assert.equal(notificationInternals.triage(success,notificationInternals.categoryOf(success)).decision,'YOS_SILENT');
});

test('risk triage handles 24 shared cases, negation and simultaneous genuine incidents',()=>{
  const cases=[["T01","銀行アプリ：口座凍結が発生しました",1],["T02","カード会社：不正利用を検知しました",1],["T03","裁判所：訴状が届きました。確認してください",1],["T04","銀行：引き落としに失敗しました。8,200円",1],["T05","水道料金：支払期限は今日です。9,000円",1],["T06","アカウント：不正アクセスを検知しました。身に覚えがなければ確認してください",1],["T07","PayPay：800円の決済が完了しました",0],["T08","ログインの認証コード：123456",0],["T09","電話：不在着信が1件あります",0],["T10","リマインダー：今日19時にゴミを出す",0],["T11","銀行：不正利用は確認されませんでした",0],["T12","架空のテスト：口座凍結が発生しました",0],["E01","セキュリティ：不正アクセスを検知しました",1],["E02","銀行：不正送金は確認されませんでした",0],["E03","銀行：口座凍結は解除されました",0],["E04","金融機関：差し押さえの可能性に注意してください",1],["E05","カード：不正利用は検出されませんでした",0],["E06","銀行：口座振替ができませんでした",1],["E07","サブスク：支払期限は明日です",1],["E08","サービス：パスワードリセット用の認証コード 987654",0],["E09","金融機関：口座凍結の予定はありません",0],["E10","法務：督促状が届きました。至急ご確認ください",1],["E11","振込失敗はありませんでした",0],["E12","配送完了：お荷物をお届けしました",0],["X01","銀行：口座凍結は解除されました。ただし不正送金を検知しました",1],["X02","銀行：不正利用は確認されませんでした。ただし口座凍結が発生しました",1],["X03","銀行：振込失敗はありませんでした。別の口座の引き落としに失敗しました",1],["X04","不正アクセスを検知しなかったことをお知らせします",0],["X05","銀行：不正アクセスは確認されませんでした",0],["X06","通常のカード決済は成功しました",0]];
  for(const [id,content,expected] of cases){
    const category=notificationInternals.categoryOf(content);
    const actual=notificationInternals.triage(content,category).decision;
    assert.equal(actual,expected?'YOS_ALERT':'YOS_SILENT',id+': '+content);
  }
});

test('mixed incident and OTP/test wording: 10-case triage and confidential Inbox redaction',async()=>{
  const cases=[["M01","銀行：不正送金を検知しました。認証コード 123456",1],["M02","銀行：口座凍結が発生しました。ワンタイム認証コードは別途ご確認ください",1],["M03","セキュリティ：不正アクセスを検知しました。本人確認コードを確認してください",1],["M04","銀行：口座凍結が発生しました。テストではありません",1],["M05","銀行：不正送金は確認されませんでした。認証コード 123456",0],["M06","ログインの認証コード：123456",0],["M07","テスト通知です：口座凍結が発生しました",0],["M08","銀行：口座凍結は解除されました。ただし不正アクセスを検知しました",1],["M09","銀行：未確認の口座凍結について相談がありました。テスト版は無関係です",1],["M10","銀行：振込失敗はありませんでした。ただし不正送金が発生しました。確認コードは別途通知します",1]];
  for(const [id,text,alert] of cases){
    const triage=notificationInternals.triage(text,notificationInternals.categoryOf(text));
    assert.equal(triage.decision,alert?'YOS_ALERT':'YOS_SILENT',id);
  }
  const h=harness();
  const r=await h.handler(h.req({text:'銀行：不正送金を検知しました。認証コード 123456',sourceApp:'銀行',eventId:'mixed-secret-case-0001'}));
  assert.equal(r.status,201);
  const obj=await r.json();
  assert.equal(obj.decision,'YOS_ALERT');
  assert.match(obj.alertText,/不正送金/);
  assert.doesNotMatch(obj.alertText,/123456/);
  assert.match(JSON.stringify(h.blocks),/不正送金/);
  assert.doesNotMatch(JSON.stringify(h.blocks),/123456/);
  const h2=harness();
  const r2=await h2.handler(h2.req({text:'ログインの認証コード：123456',eventId:'mixed-secret-case-0002'}));
  assert.equal((await r2.json()).decision,'YOS_SILENT');
  assert.doesNotMatch(JSON.stringify(h2.blocks),/123456/);
});
