import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../scriptable/YOS Clarity Inbox Bridge.js', import.meta.url), 'utf8');
function mocked(options={}) {
  const files=new Map(),blocks=[],counts={writes:0,readback:0,routed:0};let n=0;
  const rows=[],pageBlocks=[],pageName=options.pageName||'家計管理戦略',pageId='existing-page-1234';
  const fm={documentsDirectory:()=>'/docs',joinPath:(...x)=>x.join('/'),fileExists:p=>files.has(p),
    readString:p=>files.get(p),writeString:(p,v)=>{if(options.diskFail)throw Error('DISK');files.set(p,v);}};
  class Request {
    constructor(url){this.url=new URL(url);this.method='GET';this.response={statusCode:200};}
    async loadJSON(){
      const path=this.url.pathname.replace(/^\/v1/,'');
      if(this.method==='POST'&&path==='/search')
        return {results:[{id:pageId,object:'page',properties:{title:{type:'title',title:[{plain_text:pageName}]}}}],has_more:false};
      if(this.method==='POST'&&path.startsWith('/data_sources/')&&path.endsWith('/query')){
        const body=JSON.parse(this.body),f=body.filter,ds=path.split('/')[2];
        const value=r=>r.properties[f.property];
        const text=x=>(x?.rich_text||x?.title||[]).map(z=>z.text?.content||z.plain_text||'').join('');
        const matching=rows.filter(r=>r.ds===ds).filter(r=>f.rich_text?.equals?text(value(r))===f.rich_text.equals:
          f.rich_text?.contains?text(value(r)).includes(f.rich_text.contains):f.title?text(value(r))===f.title.equals:false);
        return {results:matching,has_more:false};
      }
      if(this.method==='POST'&&path==='/pages'){
        const b=JSON.parse(this.body),row={id:'page-row-'+(++n),ds:b.parent.data_source_id,properties:b.properties};
        rows.push(row);counts.routed++;
        if(options.lostRouteReply){options.lostRouteReply=false;throw Error('LOST_ROUTE');}
        return {id:row.id};
      }
      if(this.method==='GET'&&path.startsWith('/pages/'))return rows.find(r=>r.id===path.split('/').at(-1))||{};
      if(this.method==='PATCH'&&path==='/blocks/'+pageId+'/children'){
        pageBlocks.push(...JSON.parse(this.body).children.map(b=>({...b,id:'page-block-'+(++n)})));
        counts.routed++;return {results:pageBlocks};
      }
      if(this.method==='GET'&&path==='/blocks/'+pageId+'/children')
        return {results:pageBlocks,has_more:false};
      if(this.method==='PATCH') {
        counts.writes++;
        const items=JSON.parse(this.body).children.map(b=>({...b,id:'block-'+(++n)}));
        blocks.push(...items);
        if(options.lostResponse){options.lostResponse=false;throw Error('LOST');}
        return {results:items};
      }
      if(this.method==='GET' && path.endsWith('/children')) {
        const cursor=Number(this.url.searchParams.get('start_cursor')||0);
        return {results:blocks.slice(cursor,cursor+100),has_more:cursor+100<blocks.length,
          next_cursor:cursor+100<blocks.length?String(cursor+100):null};
      }
      counts.readback++;
      return blocks.find(b=>b.id===path.split('/').pop());
    }
  }
  async function run(input){
    let output='';
    const context={args:{shortcutParameter:input},Request,FileManager:{local:()=>fm},
      Keychain:{contains:()=>options.token!==false,get:()=>options.token===false?'':'token-present-mock'},
      Notification:class{async schedule(){}},Script:{setShortcutOutput:x=>{output=x;},complete:()=>{}},
      Date,Math,JSON,Array,String,Number,RegExp,Error,encodeURIComponent};
    vm.createContext(context);
    await vm.runInContext('(async()=>{'+source+'\n})()',context);
    return output;
  }
  return {files,blocks,counts,rows,pageBlocks,run};
}
test('Voice原文を同一IDでNotionへ保存し、読戻し成功まで確認する',async()=>{
  const m=mocked();
  assert.match(await m.run('明日10時に面談'),/Notion Inbox保存確認済み/);
  assert.equal(m.blocks[1].paragraph.rich_text[0].text.content,'明日10時に面談');
  assert.match(m.blocks[0].paragraph.rich_text[0].text.content,/Clarity Voice · clarity:/);
  assert.equal(m.counts.writes,1);assert.equal(m.counts.readback,3);
  assert.match(await m.run('明日10時に面談'),/保存確認済み/);
  assert.equal(m.counts.writes,1);
});
test('Notionキーがなければ端末だけ保存し、送信しない',async()=>{
  const m=mocked({token:false});
  assert.match(await m.run('保存確認用'),/Notion未保存/);
  assert.equal(m.counts.writes,0);
  assert.match(m.files.get('/docs/YOS Clarity Inbox Bridge Receipts.json'),/保存確認用/);
});
test('PATCHの応答消失後は再送せず、既存ブロックで回復する',async()=>{
  const m=mocked({lostResponse:true});
  assert.match(await m.run('応答消失テスト'),/Notion未保存/);
  assert.match(await m.run('応答消失テスト'),/保存確認済み/);
  assert.equal(m.counts.writes,1);
});
test('端末の保管が失敗した場合はNotionに一切書かない',async()=>{
  const m=mocked({diskFail:true});
  assert.match(await m.run('書込停止'),/Notion未保存/);
  assert.equal(m.counts.writes,0);
});

test('Text/Shareの構造化入力も既存Inboxへ原文を保存し入力元を残す',async()=>{
  const m=mocked();
  assert.match(await m.run({rawText:'今日の記録',source:'text',captureId:'clarity:text-abcd1234'}),/保存確認済み/);
  assert.match(m.blocks[0].paragraph.rich_text[0].text.content,/Clarity Text · clarity:text-abcd1234/);
  assert.match(await m.run({rawText:'共有した資料',source:'share',shareSource:'pdf',captureId:'share:abcde12345678'}),/保存確認済み/);
  assert.match(m.blocks[3].paragraph.rich_text[0].text.content,/Clarity Share · share:abcde12345678 · source=pdf/);
  assert.equal(m.blocks[4].paragraph.rich_text[0].text.content,'共有した資料');
  assert.equal(m.counts.writes,2);
});

test('受付IDで再送を照合し、同じIDの原文不一致は安全に止める',async()=>{
  const m=mocked();
  const x={rawText:'再送確認',source:'text',captureId:'clarity:retry-abcd1234'};
  assert.match(await m.run(x),/保存確認済み/);
  assert.match(await m.run(x),/保存確認済み/);
  assert.equal(m.counts.writes,1);
  assert.match(await m.run({...x,rawText:'違う本文'}),/Notion未保存/);
  assert.equal(m.counts.writes,1);
});

test('不明な入力元と不正IDの送信を拒否し、外部に書き込まない',async()=>{
  const m=mocked();
  assert.match(await m.run({rawText:'入力',source:'unknown'}),/Notion未保存/);
  assert.match(await m.run({rawText:'入力',source:'share',captureId:'../bad'}),/Notion未保存/);
  assert.equal(m.counts.writes,0);
});

test('異なる入力元で同一の原文を受けても別受付として保存する',async()=>{
  const m=mocked();
  assert.match(await m.run({rawText:'同じ内容',source:'voice'}),/保存確認済み/);
  assert.match(await m.run({rawText:'同じ内容',source:'text'}),/保存確認済み/);
  assert.equal(m.counts.writes,2);
});

test('保存確認済みの古い受付IDを整理後も保持し、151件目以降の再送を拒否する',async()=>{
  const m=mocked();
  for(let i=0;i<151;i++){
    const id='clarity:archive-'+String(i).padStart(8,'0');
    assert.match(await m.run({rawText:'原文'+i,source:'voice',captureId:id}),/保存確認済み/);
  }
  assert.equal(m.counts.writes,151);
  const history=JSON.parse(m.files.get('/docs/YOS Clarity Inbox Bridge Receipts.json'));
  assert.equal(history.length,151);
  assert.equal(history[0].status,'archived');
  assert.equal(history[0].captureId,'clarity:archive-00000000');
  const repeated=await m.run({rawText:'原文0',source:'voice',captureId:'clarity:archive-00000000'});
  assert.match(repeated,/Notion未保存/);
  assert.match(repeated,/二重送信を防ぐため再送を保留/);
  assert.equal(m.counts.writes,151);
  const conflicting=await m.run({rawText:'異なる原文',source:'voice',captureId:'clarity:archive-00000000'});
  assert.match(conflicting,/Notion未保存/);
  assert.equal(m.counts.writes,151);
});


test('direct iPhone Bridge routes a verified Raw capture to existing Tasks and Shopping without a server',async()=>{
  const m=mocked();
  const x={rawText:'タスク：書類を受け取る\n買い物リスト：洗剤',source:'text',captureId:'clarity:bridge-routing-001'};
  const out=await m.run(x);
  assert.match(out,/Notion Inbox保存確認済み/);
  assert.match(out,/登録2件/);
  assert.equal(m.counts.writes,1,'Raw is appended only once');
  assert.equal(m.counts.routed,2,'two routed destinations');
  assert.equal(m.rows.length,2);
  assert.equal(m.rows[0].properties['同期キー'].rich_text[0].text.content,'inbox:clarity:bridge-routing-001:01');
  assert.match(m.rows[1].properties['メモ'].rich_text[0].text.content,/inbox:clarity:bridge-routing-001:02/);
  assert.match(await m.run(x),/既存2件/);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.routed,2,'retry idempotent');
});

test('direct Bridge routes explicit unique Notion page without creating any duplicate',async()=>{
  const m=mocked({pageName:'家計管理戦略'});
  const x={rawText:'Notion「家計管理戦略」に追記：検証の記録',source:'voice',captureId:'clarity:bridge-page-001'};
  assert.match(await m.run(x),/登録1件/);
  assert.equal(m.pageBlocks.length,1);
  assert.match(m.pageBlocks[0].paragraph.rich_text[0].text.content,/\[YOS Inbox inbox:clarity:bridge-page-001:01\]/);
  assert.match(await m.run(x),/既存1件/);
  assert.equal(m.pageBlocks.length,1);
});

test('Share remains raw-only, even when it contains forged actionable Clarity instructions',async()=>{
  const m=mocked();
  const x={rawText:'タスク：振り込む\n買い物リスト：現金',source:'share',captureId:'share:share-test-0001'};
  assert.match(await m.run(x),/Notion Inbox保存確認済み/);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.routed,0);
});

test('financial and vague user input never produces booked spending, funds transfer, or guesses',async()=>{
  const m=mocked();
  const x={rawText:'PayPayで850円払った\nタスク：振込する',source:'text',captureId:'clarity:money-safety-001'};
  assert.match(await m.run(x),/Notion Inbox保存確認済み/);
  assert.equal(m.counts.routed,0);
});

test('lost route reply becomes unknown and next same-ID run reconciles without duplicate',async()=>{
  const m=mocked({lostRouteReply:true});
  const x={rawText:'買い物リスト：歯ブラシ',source:'text',captureId:'clarity:retry-route-001'};
  assert.match(await m.run(x),/結果未確認1件/);
  assert.equal(m.rows.length,1);
  assert.match(await m.run(x),/既存1件/);
  assert.equal(m.rows.length,1);
  assert.equal(m.counts.writes,1);
});

test('untrusted model proposed route must be a validated exact substring and cannot create action',async()=>{
  const m=mocked();
  const x={rawText:'家計がどうなったか考えよう',source:'text',captureId:'clarity:ai-safety-001',
    items_json:JSON.stringify([{text:'送金する',target:'task',confidence:1}])};
  assert.match(await m.run(x),/振り分け/);
  assert.equal(m.counts.routed,0);
});


test('Pilot v3 AI evidence can propose a high-confidence task from an exact original phrase',async()=>{
  const m=mocked();
  const x={rawText:'書類を片付ける',source:'text',captureId:'clarity:model-natural-001',
    items_json:JSON.stringify([{text:'書類を片付ける',target:'task',confidence:.99}])};
  assert.match(await m.run(x),/登録1件/);
  assert.equal(m.rows[0].properties['やること'].title[0].text.content,'書類を片付ける');
  assert.equal(m.rows[0].properties['同期キー'].rich_text[0].text.content,'inbox:clarity:model-natural-001:01');
  assert.match(await m.run(x),/既存1件/);
  assert.equal(m.rows.length,1);
});

test('route journal binds item index to its prior AI meaning and blocks changed plans',async()=>{
  const m=mocked();
  const first={rawText:'タスク：資料を整理する',source:'text',captureId:'clarity:model-drift-001',
    items_json:JSON.stringify([{text:'タスク：資料を整理する',target:'task',confidence:.99}])};
  assert.match(await m.run(first),/登録1件/);
  const altered={...first,items_json:JSON.stringify([{text:'タスク：資料を整理する',target:'shopping',confidence:1}])};
  assert.match(await m.run(altered),/以前と分類内容が異なる/);
  assert.equal(m.rows.length,1);
  assert.match(await m.run(first),/既存1件/);
});

test('AI overlapping fragments hold the whole plan and never invent extra Notion entries',async()=>{
  const m=mocked();
  const x={rawText:'資料を片付ける',source:'text',captureId:'clarity:overlap-001',
    items_json:JSON.stringify([
      {text:'資料を片付ける',target:'task',confidence:.99},
      {text:'資料を片付ける',target:'task',confidence:.99}
    ])};
  assert.match(await m.run(x),/振り分け未指定/);
  assert.equal(m.rows.length,0);
});

test('明示した開始・長さを日本時間で同じタスクに一回だけ保存する',async()=>{
 const m=mocked();
 const payload={source:'voice',captureId:'clarity:window-unique',rawText:'2026-11-19 19時から30分、買い物'};
 assert.match(await m.run(payload),/登録1件/);
 assert.match(await m.run(payload),/既存1件/);
 assert.equal(m.counts.writes,1);
 assert.equal(m.rows.length,1);
 assert.equal(m.rows[0].properties['やること'].title[0].text.content,'買い物');
 assert.deepEqual(m.rows[0].properties['期限'].date,{start:'2026-11-19T10:00:00.000Z',end:'2026-11-19T10:30:00.000Z'});
 assert.equal(m.rows[0].properties['同期キー'].rich_text[0].text.content,'inbox:clarity:window-unique:01');
});

test('明日の音声入力と明示した終了時刻だけを時間枠として扱う',async()=>{
 const m=mocked();
 assert.match(await m.run('明日の19時から30分買い物'),/登録1件/);
 const at=new Date(m.blocks[0].paragraph.rich_text[0].text.content.split(' · ')[0]);
 const jst=new Date(at.getTime()+9*3600000);
 const nextDay=new Date(Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate()+1,10));
 assert.equal(m.rows[0].properties['期限'].date.start,nextDay.toISOString());
 assert.match(await m.run('2026-11-21 18:15–18:45 片付け'),/登録1件/);
 assert.equal(m.rows[1].properties['期限'].date.end,'2026-11-21T09:45:00.000Z');
 for(const raw of ['明日19時、連絡','2026-02-30 12時から30分、確認','明日19時から30分、買い物はしない']){
  await m.run(raw);
 }
 assert.equal(m.rows.length,2);
});


test('Calendar Raw-only mode preserves Inbox receipt without creating duplicate Notion Task',async()=>{
  const m=mocked();
  const x={rawText:'2026-11-20 19時から30分、連携テスト',source:'voice',
    captureId:'clarity:calendar-test-001',executionTarget:'calendar.create',routeMode:'raw-only'};
  const first=await m.run(x);
  assert.match(first,/Notion Inbox保存確認済み/);
  assert.match(first,/原文のみ保存/);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.routed,0);
  assert.equal(m.rows.length,0);
  assert.match(await m.run(x),/原文のみ保存/);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.routed,0);
  assert.equal(m.blocks[1].paragraph.rich_text[0].text.content,x.rawText);
});

test('Calendar Raw-only guard fails closed when caller omits routeMode',async()=>{
  const m=mocked();
  const x={rawText:'2026-11-20 19時から30分、連携テスト',source:'voice',
    captureId:'clarity:calendar-guard-001',executionTarget:'calendar.create'};
  const output=await m.run(x);
  assert.match(output,/Notion Inbox保存確認済み/);
  assert.match(output,/振り分け保留/);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.routed,0);
  assert.equal(m.rows.length,0);
});

test('Unknown routeMode holds downstream route after verified Raw and never executes action',async()=>{
  const m=mocked();
  const x={rawText:'2026-11-20 19時から30分、買い物',source:'text',
    captureId:'clarity:route-unknown-001',routeMode:'untrusted'};
  assert.match(await m.run(x),/振り分け保留（未対応の振り分けモード）/);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.routed,0);
  assert.equal(m.rows.length,0);
});

test('Raw-only calendar capture with missing Notion credentials is held locally and not sent',async()=>{
  const m=mocked({token:false});
  const x={rawText:'2026-11-20 19時から30分、連携テスト',source:'voice',
    captureId:'clarity:calendar-offline-001',executionTarget:'calendar.create',routeMode:'raw-only'};
  assert.match(await m.run(x),/Notion未保存/);
  assert.equal(m.counts.writes,0);
  assert.equal(m.counts.routed,0);
  assert.match(m.files.get('/docs/YOS Clarity Inbox Bridge Receipts.json'),/calendar-offline-001/);
});


test('JOURNAL private draft reuses verified Inbox transport without Clarity routing',async()=>{
  const m=mocked();
  const x={rawText:'## 【YOS_EDITORIAL_DRAFT_V1】\n### 【資料と照合状況】\n- DOI:10.1038/s41598-017-00526-9\n### 【公開不可・要審査】',
    source:'journal',captureId:'journal:edition-20261124-001'};
  const result=await m.run(x);
  assert.match(result,/Notion Inbox保存確認済み/);
  assert.match(m.blocks[0].paragraph.rich_text[0].text.content,/YOS JOURNAL Draft · journal:edition-20261124-001/);
  assert.equal(m.blocks[1].paragraph.rich_text[0].text.content,x.rawText);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.readback,3);
  assert.equal(m.counts.routed,0,'private draft never becomes a Task, Shopping or public issue');
  assert.match(await m.run(x),/保存確認済み/);
  assert.equal(m.counts.writes,1,'same edition ID never appends twice');
  assert.equal(m.counts.routed,0);
  assert.match(await m.run({...x,rawText:'改変された別の原稿'}),/Notion未保存/);
  assert.equal(m.counts.writes,1,'same ID with different content fails closed');
});

test('JOURNAL long drafts are chunked and read back while Clarity length limit stays unchanged',async()=>{
  const m=mocked();
  const draft='【YOS_EDITORIAL_DRAFT_V1】\n'+'研究原稿'.repeat(3800);
  const x={rawText:draft,source:'journal',captureId:'journal:long-draft-0001'};
  assert.ok(draft.length>12000&&draft.length<36000);
  assert.match(await m.run(x),/Notion Inbox保存確認済み/);
  assert.equal(m.counts.writes,1);
  assert.equal(m.counts.routed,0);
  assert.equal(m.blocks.slice(1,-1).map(b=>b.paragraph.rich_text[0].text.content).join(''),draft);
  const over='あ'.repeat(36001);
  assert.match(await m.run({rawText:over,source:'journal',captureId:'journal:too-long-0001'}),/Notion未保存/);
  assert.equal(m.counts.writes,1);
  assert.match(await m.run({rawText:draft,source:'text',captureId:'clarity:too-long-0001'}),/Notion未保存/);
  assert.equal(m.counts.writes,1);
});
