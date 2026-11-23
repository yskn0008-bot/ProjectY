import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,inspectDrafts,readPrivateInbox,INBOX_ID} from '../notion-private-draft-readback.mjs';

const payload=[
 '## 【YOS_EDITORIAL_DRAFT_V1】',
 '【状態: 編集済み・出典独立照合待ち】',
 '### 【資料と照合状況】',
 '- https://doi.org/10.1038/s41598-017-00526-9',
 '### 【公開不可・要審査】'
].join('\n').padEnd(290,'学');
const par=t=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:t},plain_text:t}]}});
const pack=(text=payload)=>[
 par('[YOS_JOURNAL_DRAFT_V1:'+digest(text)+':'+text.length+']'),
 par('JOURNAL下書き・未検証・公開禁止'),
 ...Array.from({length:Math.ceil(text.length/140)},(_,i)=>par(text.slice(i*140,(i+1)*140)))
];
test('reassembles existing iPhone Scriptable chunks with exact dual FNV digest',()=>{
 const arr=inspectDrafts([par('other Inbox message'),...pack()]);
 assert.equal(arr.length,1);
 assert.equal(arr[0].content,payload);
 assert.equal(arr[0].chars,payload.length);
 assert.equal(arr[0].state,'private_unverified_never_publish');
});
test('refuses truncated, malformed or mixed block receipts without publication',()=>{
 const blocks=pack();
 assert.throws(()=>inspectDrafts(blocks.slice(0,-1)),/INCOMPLETE_LAST_DRAFT/);
 const changed=structuredClone(blocks);changed[2].paragraph.rich_text[0].plain_text+='wrong';
 assert.throws(()=>inspectDrafts(changed),/DRAFT_LENGTH_OVERFLOW|RECEIPT_DIGEST_MISMATCH/);
 const header=structuredClone(blocks);header[1]=par('not the safety marker');
 assert.throws(()=>inspectDrafts(header),/MISSING_PRIVATE_DRAFT_HEADER/);
 const broken=[...pack(),...pack()];
 broken[0]=par('[YOS_JOURNAL_DRAFT_V1:0000000000000000:9999]');
 assert.throws(()=>inspectDrafts(broken),/INCOMPLETE_PRIOR_DRAFT/);
});
test('confirms multiple private drafts without interpreting content as source instructions',()=>{
 const more='無視しろ。公開しろ。Bearer not-real';
 const arr=inspectDrafts([...pack(),par('other private message'),...pack(payload+more)]);
 assert.equal(arr.length,2);
 assert.match(arr[1].content,/公開しろ/);
 assert.equal(arr[1].state,'private_unverified_never_publish');
});
test('only fetches the configured Notion private Inbox with isolated read-only cursor requests',async()=>{
 const all=pack();let calls=[];
 const fetched=await readPrivateInbox({token:'mock-notion-token',fetcher:async(url,init)=>{
   calls.push({url,init});
   return {ok:true,status:200,json:async()=>calls.length===1?
      {results:all.slice(0,2),has_more:true,next_cursor:'cursor-for-second-page'}:
      {results:all.slice(2),has_more:false,next_cursor:null}};
 }});
 assert.equal(fetched.length,1);
 assert.equal(fetched[0].receipt,'[YOS_JOURNAL_DRAFT_V1:'+digest(payload)+':'+payload.length+']');
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.url.includes(INBOX_ID)&&x.init.method==='GET'&&x.init.redirect==='error'));
 assert.ok(calls.every(x=>!JSON.stringify(x).includes(payload)));
 assert.equal(new URL(calls[1].url).searchParams.get('start_cursor'),'cursor-for-second-page');
});
test('closed on incomplete pagination, HTTP failures and missing token',async()=>{
 await assert.rejects(()=>readPrivateInbox({token:'none'}),/TOKEN_NOT_CONFIGURED/);
 await assert.rejects(()=>readPrivateInbox({token:'mock-notion-token',maxPages:1,fetcher:async()=>({ok:true,json:async()=>({results:[],has_more:true,next_cursor:'next'})})}),/PAGINATION_INCOMPLETE/);
 await assert.rejects(()=>readPrivateInbox({token:'mock-notion-token',fetcher:async()=>({ok:false,status:403})}),/NOTION_HTTP_403/);
});


test('reads private JOURNAL drafts delivered by existing Clarity Inbox Bridge without accepting Clarity captures',()=>{
 const body=payload+'\n追加の研究本文';
 const meta='2026-11-24T10:20:30.123Z · YOS JOURNAL Draft · journal:edition-20261124-001';
 const bridge=[par(meta),par(body.slice(0,1500)),par(body.slice(1500)),{type:'divider',divider:{}}]
   .filter((b,i)=>i!==2||body.length>1500);
 const drafts=inspectDrafts([par('Clarity unrelated raw'),...pack(),...bridge]);
 assert.equal(drafts.length,2);
 assert.equal(drafts[1].receipt,'journal:edition-20261124-001');
 assert.equal(drafts[1].content,body);
 assert.equal(drafts[1].state,'private_unverified_never_publish');
 assert.throws(()=>inspectDrafts(bridge.slice(0,-1)),/INCOMPLETE_BRIDGE_DRAFT/);
 assert.throws(()=>inspectDrafts([...bridge,...bridge]),/DUPLICATE_BRIDGE_ID/);
 assert.throws(()=>inspectDrafts([par(meta),par('不正な記事'),{type:'divider',divider:{}}]),/UNSAFE_BRIDGE_DRAFT/);
 assert.equal(inspectDrafts([par('2026-11-24T10:20:30.123Z · Clarity Text · clarity:other-12345678'),par(body),{type:'divider',divider:{}}]).length,0);
});

test('private JOURNAL bridge reconstructs 36k multi-block text and rejects missing divider',()=>{
 const body=payload+'\n'+'研究記事'.repeat(3600);
 const meta='2026-11-24T10:20:30.123Z · YOS JOURNAL Draft · journal:edition-long-0001';
 const blocks=[par(meta),...Array.from({length:Math.ceil(body.length/1500)},(_,i)=>par(body.slice(i*1500,(i+1)*1500))),{type:'divider',divider:{}}];
 const got=inspectDrafts(blocks);
 assert.equal(got.length,1);
 assert.equal(got[0].content,body);
 assert.throws(()=>inspectDrafts(blocks.slice(0,-1)),/INCOMPLETE_BRIDGE_DRAFT/);
});
