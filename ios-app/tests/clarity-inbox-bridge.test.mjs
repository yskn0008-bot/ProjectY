import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../scriptable/YOS Clarity Inbox Bridge.js', import.meta.url), 'utf8');
function mocked(options={}) {
  const files=new Map(),blocks=[],counts={writes:0,readback:0};let n=0;
  const fm={documentsDirectory:()=>'/docs',joinPath:(...x)=>x.join('/'),fileExists:p=>files.has(p),
    readString:p=>files.get(p),writeString:(p,v)=>{if(options.diskFail)throw Error('DISK');files.set(p,v);}};
  class Request {
    constructor(url){this.url=new URL(url);this.method='GET';this.response={statusCode:200};}
    async loadJSON(){
      const path=this.url.pathname;
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
  return {files,blocks,counts,run};
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
