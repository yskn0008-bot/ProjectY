import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../journal_draft_inbox_inline.js',import.meta.url),'utf8');
const raw='【YOS_EDITORIAL_DRAFT_V1】\n【状態: 下書き・出典独立照合待ち】\n【記事見出し】独自の科学記事\n【本文】'+
'根拠の記載がない具体的事実は主張せず、確認してから発行する。'.repeat(10)+'\n【公開不可・要審査】';

function mock({input=raw,key=true,loseAfterWrite=false,existing=[],unknownScan=false}={}) {
  const blocks=structuredClone(existing),calls=[],notifications=[],outputs=[];
  let id=1000+blocks.length,lost=false;
  class Request {
    constructor(url){this.url=url;this.method='GET';this.response=null;}
    async loadJSON(){
      calls.push({method:this.method,url:this.url});
      assert.ok(this.url.startsWith('https://api.notion.com/v1/'),this.url);
      assert.match(this.headers.Authorization,/^Bearer /);
      const u=new URL(this.url),path=u.pathname;
      this.response={statusCode:200};
      if(this.method==='GET' && path.endsWith('/children')){
        return {results:blocks,has_more:unknownScan,next_cursor:unknownScan?'no-progress':null};
      }
      if(this.method==='PATCH' && path.endsWith('/children')){
        const children=JSON.parse(this.body).children;
        const added=children.map(b=>({...b,id:'fake-'+id++}));
        blocks.push(...added);
        if(loseAfterWrite&&!lost){lost=true;throw new Error('network response lost after write');}
        return {results:added};
      }
      if(this.method==='GET' && path.includes('/blocks/fake-')){
        const v=blocks.find(x=>x.id===path.split('/').pop());
        if(!v)throw Error('not found');
        return v;
      }
      throw Error('unexpected '+this.method+' '+path);
    }
  }
  class Notification {async schedule(){notifications.push({title:this.title,body:this.body})}}
  const Keychain={contains:()=>key,get:()=>key?'ntn_test_private_token':'',};
  const args={shortcutParameter:input};
  const Script={setShortcutOutput:x=>outputs.push(x),complete:()=>{}};
  const context={Request,Notification,Keychain,args,Script,Intl,Date,Math,String,JSON,Array,Object,encodeURIComponent,Error};
  const execute=async()=>await runInNewContext('(async()=>{'+source+'})()',context);
  return {execute,blocks,calls,notifications,outputs};
}
test('private inbox receives a verified draft once and never publishes',async()=>{
  const m=mock();
  await m.execute();
  assert.match(m.outputs[0],/NOTION_CONFIRMED/);
  assert.equal(m.calls.filter(x=>x.method==='PATCH').length,1);
  assert.equal(m.notifications.length,0);
  const count=m.blocks.length;
  await m.execute();
  assert.equal(m.blocks.length,count);
  assert.match(m.outputs[1],/ALREADY_VERIFIED/);
  assert.equal(m.calls.filter(x=>x.method==='PATCH').length,1);
});
test('unknown response is held, never blind re-sent after a persisted write',async()=>{
  const m=mock({loseAfterWrite:true});
  await m.execute();
  assert.match(m.outputs[0],/NOTION_HELD/);
  assert.equal(m.notifications.length,1);
  await m.execute();
  assert.match(m.outputs[1],/NOTION_CONFIRMED/);
  assert.equal(m.calls.filter(x=>x.method==='PATCH').length,1);
});
test('missing Keychain token protects local backup and does no network IO',async()=>{
  const m=mock({key:false});
  await m.execute();
  assert.match(m.outputs[0],/NOTION_HELD:NOTION_KEY_MISSING/);
  assert.equal(m.calls.length,0);
});
test('invalid draft marker and oversize draft never reach Notion',async()=>{
  for(const input of ['無関係な文章'.repeat(40),raw.repeat(100)]){
    const m=mock({input});
    await m.execute();
    assert.match(m.outputs[0],/NOTION_HELD/);
    assert.equal(m.calls.length,0);
  }
});
test('an incomplete scan never implies safe absence',async()=>{
  const m=mock({unknownScan:true});
  await m.execute();
  assert.match(m.outputs[0],/NOTION_HELD/);
  assert.equal(m.calls.filter(x=>x.method==='PATCH').length,0);
});
test('different content yields a different receipt without overwriting first draft',async()=>{
  const a=mock();
  await a.execute();
  const edited=raw.replace('独自の科学記事','別の科学記事');
  const b=mock({input:edited,existing:a.blocks});
  await b.execute();
  assert.match(b.outputs[0],/NOTION_CONFIRMED/);
  assert.equal(b.calls.filter(x=>x.method==='PATCH').length,1);
  assert.equal(b.blocks.filter(x=>String(x.paragraph?.rich_text?.[0]?.text?.content||'').startsWith('[YOS_JOURNAL_DRAFT_V1:')).length,2);
});
