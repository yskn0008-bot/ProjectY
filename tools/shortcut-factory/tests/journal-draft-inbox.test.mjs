import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../journal_draft_inbox_inline.js',import.meta.url),'utf8');
const raw='【YOS_EDITORIAL_DRAFT_V1】\\n【状態: 下書き・出典独立照合待ち】\\n【記事見出し】記事の見出し\\n【本文】'+
'未確認の内容は公開せず、必ず人間による独立検証を行う。'.repeat(10)+'\\n【公開不可・要審査】';
function mock({input=raw,key=true,loss=false,responseBad=false,readbackLoss=false,readbackBad=false,outputError=false,records,failWrite=false}={}){
 const store=records??new Map(),calls=[],outputs=[],done=[],blocks=new Map();
 class Request {
   constructor(url){this.url=url;this.response={statusCode:200};}
   async loadJSON(){
     calls.push({url:this.url,method:this.method,body:this.body});
     assert.ok(this.url.startsWith('https://api.notion.com/v1/'));
     if(this.method==='GET'){
       if(readbackLoss)throw Error('get_lost');
       const id=this.url.split('/').at(-1);
       const block=blocks.get(id);
       return readbackBad&&id==='fake-1'?{...block,paragraph:{rich_text:[{type:'text',text:{content:'wrong'}}]}}:block;
     }
     const segs=JSON.parse(this.body).children;
     if(loss)throw Error('response_lost');
     const created=segs.map((x,i)=>({...x,id:'fake-'+i, ...(responseBad&&i===1?{type:'divider'}:{})}));
     for(const b of created)blocks.set(b.id,b);
     return {results:created};
   }
 }
 const Keychain={contains:()=>key,get:()=>key?'ntn_test_private_token':''};
 const FileManager={local:()=>({documentsDirectory:()=>'/tmp',joinPath:(_,x)=>x,
   fileExists:p=>store.has(p),readString:p=>store.get(p),
   writeString:(p,s)=>{if(failWrite)throw Error('STORAGE_FAILED');store.set(p,s)}})};
 const Script={setShortcutOutput:v=>{if(outputError)throw Error('OUTPUT_FAILED');outputs.push(v);},complete:()=>done.push(true)};
 const context={Request,Keychain,FileManager,Script,args:{shortcutParameter:input},Intl,Date,Math,String,JSON,Array,Object,Error};
 const execute=async()=>runInNewContext('(async()=>{'+source+'})()',context);
 return {execute,store,calls,outputs,done};
}
test('only independently GET-verified Notion content reports success',async()=>{
 const t=mock();await t.execute();assert.match(t.outputs[0],/NOTION_VERIFIED:NOTION_INDEPENDENT_READBACK_MATCH/);
 assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
 assert.ok(t.calls.some(c=>c.method==='GET'));assert.equal(t.done.length,1);
});
test('same draft is not retransmitted on rerun',async()=>{
 const t=mock();await t.execute();await t.execute();
 assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
 assert.match(t.outputs[1],/ALREADY_READBACK_VERIFIED/);assert.equal(t.done.length,2);
});
test('lost acknowledgement is held without blind retransmission',async()=>{
 const t=mock({loss:true});await t.execute();await t.execute();
 assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);assert.match(t.outputs[1],/PREVIOUS_RESULT_UNKNOWN/);assert.equal(t.done.length,2);
});
test('missing Keychain token causes no network and no receipt write',async()=>{
 const t=mock({key:false});await t.execute();assert.equal(t.calls.length,0);
 assert.equal(t.store.size,0);assert.match(t.outputs[0],/NOTION_KEY_MISSING/);assert.equal(t.done.length,1);
});
test('malformed Notion response cannot report sent',async()=>{
 const t=mock({responseBad:true});await t.execute();await t.execute();
 assert.match(t.outputs[0],/NOTION_HELD/);assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
});
test('failure writing receipt blocks Notion submission',async()=>{
 const t=mock({failWrite:true});await t.execute();assert.equal(t.calls.length,0);assert.equal(t.done.length,1);
});
test('Script.complete runs even if Shortcuts output API throws',async()=>{
 const t=mock({outputError:true});await t.execute();assert.equal(t.done.length,1);
});
test('invalid and oversize drafts are not sent',async()=>{
 for(const input of ['not a journal'.repeat(30),raw.repeat(200)]){
  const t=mock({input});await t.execute();assert.equal(t.calls.length,0);assert.equal(t.done.length,1);
 }
});
test('different draft content receives distinct receipts',async()=>{
 const store=new Map(),a=mock({records:store}),b=mock({records:store,input:raw.replace('記事の見出し','別の記事')});
 await a.execute();await b.execute();assert.equal(a.calls.filter(c=>c.method==='PATCH').length,1);assert.equal(b.calls.filter(c=>c.method==='PATCH').length,1);
 assert.equal(JSON.parse(store.values().next().value).length,2);
});

test('GET outage never falsely confirms nor resubmits the draft',async()=>{
 const t=mock({readbackLoss:true});await t.execute();await t.execute();
 assert.match(t.outputs[0],/NOTION_PENDING:NOTION_READBACK_PENDING/);
 assert.match(t.outputs[1],/NOTION_PENDING:NOTION_READBACK_PENDING/);
 assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
});
test('GET content mismatch never reports verified',async()=>{
 const t=mock({readbackBad:true});await t.execute();
 assert.match(t.outputs[0],/NOTION_PENDING:NOTION_READBACK_PENDING/);
 assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
});
test('legacy submitted receipt without block IDs stays pending without retransmission',async()=>{
 const t=mock();
 let a=2166136261,b=2246822519;
 for(let i=0;i<raw.length;i++){
   const c=raw.charCodeAt(i);
   a=Math.imul(a^c,16777619)>>>0;
   b=Math.imul(b^c,3266489917)>>>0;
 }
 const digest=[a,b].map(x=>x.toString(16).padStart(8,'0')).join('');
 const id='[YOS_JOURNAL_DRAFT_V1:'+digest+':'+raw.length+']';
 t.store.set('YOS JOURNAL Draft Receipt Cache.json',JSON.stringify([{id,status:'submitted'}]));
 await t.execute();
 assert.match(t.outputs[0],/NOTION_PENDING:SUBMITTED_READBACK_PENDING/);
 assert.equal(t.calls.length,0);
});

const urls=[1,2,3].map(n=>'https://doi.org/10.1234/test-'+n);
const provenance='\n\n<<YOS_JOURNAL_RESEARCH_PROVENANCE_V1>>\n\nYOS_RESEARCH_ABSTRACT_V1\n自動公開禁止\n'+urls.map((u,i)=>'資料'+(i+1)+'｜Test\n論文リンク: '+u).join('\n');
test('three-source private draft preserves exact research provenance',async()=>{
 const t=mock({input:raw+'\n'+urls.join('\n')+provenance});await t.execute();
 assert.match(t.outputs[0],/NOTION_VERIFIED/);
 assert.ok(t.calls.find(c=>c.method==='PATCH').body.includes('YOS_JOURNAL_RESEARCH_PROVENANCE_V1'));
});
test('missing or invented DOI is archived only as unverified private draft',async()=>{
 for(const links of [urls.slice(0,2),[...urls.slice(0,2),'https://doi.org/10.1234/invented']]){
 const t=mock({input:raw+'\n'+links.join('\n')+provenance});await t.execute();
 assert.match(t.outputs[0],/NOTION_VERIFIED:NOTION_INDEPENDENT_READBACK_MATCH:THREE_SOURCE_PROVENANCE_MISMATCH_REVIEW_REQUIRED/);
 const sent=JSON.parse(t.calls.find(c=>c.method==='PATCH').body).children.map(b=>b.paragraph.rich_text[0].text.content);
 assert.equal(sent[1],'JOURNAL下書き・未検証・公開禁止');
 assert.equal(sent.slice(2).join(''),(raw+'\n'+links.join('\n')+provenance).trim());
 assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
 }
});

test('editorial source URLs are accepted only when present in research backup',async()=>{const links=['https://www.theguardian.com/science/test-a','https://www.bbc.com/news/test-b',urls[2]];const p=provenance.replaceAll(urls[0],links[0]).replaceAll(urls[1],links[1]);const t=mock({input:raw+'\n'+links.join('\n')+p});await t.execute();assert.match(t.outputs[0],/NOTION_VERIFIED/);});

test('Markdown citations match exact research URL without closing delimiter',async()=>{const t=mock({input:raw+'\n'+urls.map(u=>'[出典]('+u+')').join('\n')+provenance});await t.execute();assert.match(t.outputs[0],/NOTION_VERIFIED/);});

test('single text list from Shortcuts preserves exact draft',async()=>{const t=mock({input:[raw]});await t.execute();assert.match(t.outputs[0],/NOTION_VERIFIED/);});
test('null and ambiguous list inputs fail closed with type-only diagnostic',async()=>{for(const input of [null,[raw,raw],{text:raw}]){const t=mock({input});await t.execute();assert.match(t.outputs[0],/NO_TEXT_INPUT_(NULL|ARRAY|OBJECT)/);assert.equal(t.calls.length,0);}});

test('unverified provenance stays flagged on retry, with no duplicate write',async()=>{
 const t=mock({input:raw+'\n'+urls[0]+provenance});await t.execute();await t.execute();
 assert.match(t.outputs[1],/ALREADY_READBACK_VERIFIED:THREE_SOURCE_PROVENANCE_MISMATCH_REVIEW_REQUIRED/);
 assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
});
test('source mismatch does not bypass secret guard or readback failure',async()=>{
 const input=raw+'\n'+urls[0]+provenance;
 const bad=mock({input:input+'\nBearer fake-secret'});await bad.execute();assert.equal(bad.calls.length,0);assert.match(bad.outputs[0],/SENSITIVE_TOKEN_MARKER/);
 const pending=mock({input,readbackLoss:true});await pending.execute();assert.match(pending.outputs[0],/NOTION_PENDING:NOTION_READBACK_PENDING:THREE_SOURCE_PROVENANCE_MISMATCH_REVIEW_REQUIRED/);
});
