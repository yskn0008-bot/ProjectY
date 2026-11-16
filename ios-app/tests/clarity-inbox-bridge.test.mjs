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
  assert.match(m.blocks[0].paragraph.rich_text[0].text.content,/Clarity\\.Voice · clarity:/);
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
