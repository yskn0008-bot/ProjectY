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
