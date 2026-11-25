import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const a=read('../../../journal/notion-private-draft-readback.mjs'),b=read('../../../server/yos-ai/src/routes/journal-reader.mjs'),app=read('../journal_private_reading_inline.js');
const inbox=a.slice(a.indexOf('export const INBOX_ID'),a.indexOf('export async function readPrivateInbox')).replace(/^export /gm,'');
const parser=b.slice(0,b.indexOf('export function createJournalReader')).replace(/^export /gm,'');
const prefix=inbox+'\n'+parser;
const {digest,parseReviewedEdition,readingPage,inboxPage}=new Function(prefix+'\nreturn {digest,parseReviewedEdition,readingPage:PAGE,inboxPage:INBOX_ID};')();
const A=Object.getPrototypeOf(async function(){}).constructor,runner=new A('Request','Keychain','FileManager','Script','args',prefix+'\n'+app);
const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10),older=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10);
const B=(type,t,url)=>({type,[type]:type==='divider'?{}:{rich_text:[{text:{content:t,...(url?{link:{url}}:{})}}]}});
const old=[B('heading_2','YOS JOURNAL｜'+older.replace(/-/g,'.')),B('paragraph','以前の見出し'),B('paragraph','以前の導入'),B('paragraph','本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。')];
for(let i=1;i<=3;i++)old.push(B('divider'),B('heading_3','0'+i+' / SCIENCE｜以前の記事'),B('paragraph','概要'),B('paragraph','根拠'),B('paragraph','日常への視点：行動'),B('paragraph','研究の限界：限界'),B('paragraph','原著論文','https://doi.org/10.1234/old'+i));old.push(B('divider'));
const links=[1,2,3].map(i=>'https://doi.org/10.1234/new'+i);
const draft={headline:'研究を生活へつなぐ情報誌',lead:'本人向けの合成資料を使った試験専用の導入文です。',articles:links.map((link,i)=>({category:'SCIENCE',title:'合成資料による試験専用記事'+i,summary:'合成テスト用の記事で、実在する研究内容を示すものではありません。確認処理だけを試験します。',reason:'合成資料を用いて、既存読書版の保存処理を検査します。',action:'合成試験の手順を確認します。',caveat:'実在の研究結果ではないため一般化できません。',link}))};
const approved='YOS_RESEARCH_APPROVED_V1\n自動公開禁止\n'+links.map((link,i)=>'資料'+(i+1)+'｜Synthetic original article title\n出版年: 2025\n論文リンク: '+link+'\n方法の原文: '+'A synthetic passage about methods. '.repeat(3)+'\n結果の原文: '+'A synthetic passage about results. '.repeat(3)+'\n考察・限界の原文: '+'A synthetic passage about limitations. '.repeat(3)).join('\n\n');
function packet(d=draft,e=approved,review='YOS_FINAL_REVIEW_PASS_V1'){
 const raw='【YOS_EDITORIAL_DRAFT_V1】\n【資料と照合状況】\n'+JSON.stringify(d)+'\n【公開不可・要審査】\n\n<<YOS_JOURNAL_RESEARCH_PROVENANCE_V1>>\n\n'+e+'\n\n<<YOS_FINAL_REVIEW_RECEIPT_V1>>\n'+review;
 const id='journal:'+digest(raw)+'-'+raw.length,receipt='YOS_JOURNAL_NOTION_VERIFIED: mock\n保存確認\n'+id;
 return {id,raw,input:raw+'\n<<YOS_INBOX_RECEIPT_V1>>\n'+receipt,blocks:[B('paragraph','2026-11-25T00:00:00.000Z · YOS JOURNAL Draft · '+id),...Array.from({length:Math.ceil(raw.length/1000)},(_,i)=>B('paragraph',raw.slice(i*1000,(i+1)*1000))),B('divider')]};
}
const pkt=packet(),clone=x=>JSON.parse(JSON.stringify(x));
function mock({history=clone(old),stored=clone(pkt.blocks),loss=false,lossAfter=false,key=true,change=false}={}){
 let writes=0,reads=0;const files=new Map();const fm={documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:k=>files.has(k),writeString:(k,v)=>files.set(k,v),readString:k=>files.get(k)};
 class Req{constructor(url){this.url=url;}async loadJSON(){this.response={statusCode:200};assert.ok(this.url.startsWith('https://api.notion.com/'));assert.equal(this.headers.Authorization,'Bearer mock-token-123456');
 if(this.url.includes(inboxPage)){assert.equal(this.method,'GET');return {results:stored,has_more:false};}
 assert.ok(this.url.includes(readingPage));if(this.method==='PATCH'){writes++;if(loss)throw Error('lost');history.push(...JSON.parse(this.body).children);if(lossAfter)throw Error('lost after append');return{results:[],has_more:false};}reads++;if(change&&reads===2)return{results:[...history,B('paragraph','concurrent unrelated edit')],has_more:false};const start=Number(/start_cursor=(\d+)/.exec(this.url)?.[1]||0),end=start+100;return{results:clone(history.slice(start,end)),has_more:end<history.length,next_cursor:end<history.length?String(end):null};}}
 return {run:async(value=pkt.input)=>{let output;await runner(Req,{contains:()=>key,get:()=>'mock-token-123456'}, {local:()=>fm},{setShortcutOutput:x=>output=x,complete:()=>{}},{shortcutParameter:value});return output},writes:()=>writes,history};
}
test('exact Inbox and GPT pass append the new issue, disclose review scope, preserve old issue and recognize retry',async()=>{
 const m=mock();assert.equal(await m.run(),'YOS_JOURNAL_READING_VERIFIED:SAVED_AND_READBACK');assert.equal(m.writes(),1);assert.equal(parseReviewedEdition(m.history).reviewScope,'gpt_original_excerpt_checked');assert.deepEqual(m.history.slice(0,old.length),old);assert.equal(await m.run(),'YOS_JOURNAL_READING_VERIFIED:ALREADY_SAVED');assert.equal(m.writes(),1);
});
test('receipt mismatch, absent Inbox, missing key and bad final result do not write',async()=>{
 for(const [m,input,reason] of [[mock(),pkt.input.replace(pkt.id,pkt.id+'bad'),'RECEIPT_MISMATCH'],[mock({stored:[]}),pkt.input,'INBOX_READBACK_MISMATCH'],[mock({key:false}),pkt.input,'TOKEN_MISSING'],[mock(),packet(draft,approved,'YOS_FINAL_REVIEW_HOLD_V1').input,'FINAL_REVIEW_REQUIRED']]){
  assert.match(await m.run(input),new RegExp(reason));assert.equal(m.writes(),0);
 }
});
test('same day different edition, previously published source, concurrent history change and invalid JSON shape are held',async()=>{
 const today=clone(old);today[0].heading_2.rich_text[0].text.content='YOS JOURNAL｜'+day.replace(/-/g,'.');
 const prior=clone(old);prior[10].paragraph.rich_text[0].text.link.url=links[0];
 for(const [m,input,reason] of [[mock({history:today}),pkt.input,'DATE_COLLISION'],[mock({history:prior}),pkt.input,'PREVIOUS_SOURCE'],[mock({change:true}),pkt.input,'HISTORY_CHANGED'],[mock(),packet({...draft,unknown:true}).input,'ISSUE_SCHEMA']]){
  assert.match(await m.run(input),new RegExp(reason));assert.equal(m.writes(),0);
 }
});
test('unknown append result never writes twice; successful-but-lost response reconciles',async()=>{
 const m=mock({loss:true});assert.match(await m.run(),/CHECK_FAILED/);assert.match(await m.run(),/PREVIOUS_APPEND_UNCONFIRMED/);assert.equal(m.writes(),1);
 const n=mock({lossAfter:true});assert.match(await n.run(),/CHECK_FAILED/);assert.equal(await n.run(),'YOS_JOURNAL_READING_VERIFIED:ALREADY_SAVED');assert.equal(n.writes(),1);
});

test('preserves more than 500 previous reading blocks when adding one issue',async()=>{
 const history=[];
 for(let n=0;n<25;n++){
  const h=clone(old),date=new Date(Date.UTC(2025,0,n+1)).toISOString().slice(0,10);h[0].heading_2.rich_text[0].text.content='YOS JOURNAL｜'+date.replace(/-/g,'.');
  for(const b of h)for(const t of b[b.type]?.rich_text||[])if(t.text?.link)t.text.link.url+='-'+n;
  history.push(...h);
 }
 assert.ok(history.length>500);
 const before=clone(history),m=mock({history});
 assert.equal(await m.run(),'YOS_JOURNAL_READING_VERIFIED:SAVED_AND_READBACK');assert.deepEqual(m.history.slice(0,before.length),before);assert.equal(m.writes(),1);
});
