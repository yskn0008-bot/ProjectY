import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest} from '../../journal/notion-private-draft-readback.mjs';
const src=await readFile(new URL('../scriptable/YOS JOURNAL.js',import.meta.url),'utf8');
const runner=new (Object.getPrototypeOf(async function(){}).constructor)('Request','Keychain','WebView','FileManager','Safari','Script','args',src);

const B=(type,t,url)=>({type,[type]:{rich_text:[{plain_text:t,...(url?{href:url}:{})}]}});
const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10),yesterday=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10);
const old=[B('heading_2','YOS JOURNAL｜'+yesterday.replaceAll('-','.')),B('paragraph','合成過去号'),B('paragraph','合成導入'),B('paragraph','本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。')];
for(let i=1;i<=3;i++)old.push({type:'divider'},B('heading_3','0'+i+' / SCIENCE｜既刊'),B('paragraph','概要'),B('paragraph','根拠'),B('paragraph','日常への視点：行動'),B('paragraph','研究の限界：限界'),B('paragraph','原著論文','https://doi.org/10.1234/old'+i));old.push({type:'divider'});
function mock({history=JSON.parse(JSON.stringify(old)),key=true}={}){
 let inboxRows=[],writes=0,publicRequests=0,groups=0;const files=new Map(),dirs=new Set(['/local']),records=new Map();
 const fm={documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),readString:p=>{if(!files.has(p))throw Error('missing');return files.get(p)},writeString:(p,s)=>files.set(p,s)};
 class R{constructor(url){this.url=url;}async loadJSON(){this.response={statusCode:200};if(this.url.includes('api.notion.com')){assert(this.headers.Authorization==='Bearer mock-token-123456','auth');if(this.url.includes('3d35ca88'))return{results:inboxRows,has_more:false};if(this.method==='PATCH'){writes++;history.push(...JSON.parse(this.body).children);return{results:[]}}return{results:JSON.parse(JSON.stringify(history)),has_more:false};}publicRequests++;assert(!this.headers.Authorization,'leak');const n=groups++*10;const rows=[1,2,3,4].map(i=>({doi:'10.1234/study'+(n+i),pmcid:'PMC1234'+String(n+i).padStart(2,'0'),pubYear:'2025'}));rows.forEach(r=>records.set(r.pmcid,r));return{resultList:{result:rows}}}
 async loadString(){this.response={statusCode:200};publicRequests++;const pmc=/\/(PMC\d+)\/fullTextXML$/.exec(this.url)?.[1],r=records.get(pmc);const sec=s=>('Synthetic '+s+' passage containing sufficient methodological details, conditions and limitations for a test fixture. ').repeat(7);return '<article article-type="research-article"><front><article-meta><article-id pub-id-type="doi">'+r.doi+'</article-id><article-id pub-id-type="pmc">'+r.pmcid.slice(3)+'</article-id><article-title>Synthetic research article for testing</article-title></article-meta></front><body><sec><title>Methods</title><p>'+sec('methods')+'</p></sec><sec><title>Results</title><p>'+sec('results')+'</p></sec><sec><title>Discussion</title><p>'+sec('discussion')+'</p></sec></body></article>';}}
 return {history,files,writes:()=>writes,publicRequests:()=>publicRequests,setInbox:r=>inboxRows=r,run:async cmd=>{let result;await runner(R,{contains:()=>key,get:()=>'mock-token-123456'},class{}, {local:()=>fm},{},{setShortcutOutput:x=>result=x,complete:()=>{}},{shortcutParameter:{mode:'yos-journal-production-v1',...cmd}});return JSON.parse(result)}};
}
async function check(){
 const m=mock(),p=await m.run({op:'prepare'});assert(p.status==='prompt'&&p.stage==='review','prepare '+JSON.stringify(p).slice(0,200));
 const pool=JSON.parse(JSON.parse([...m.files].find(([k])=>k.endsWith('-pool.json'))[1]).pool.split('\n').slice(1).join('\n'));
 const picked=[0,1,2].map(g=>pool.find(x=>x.group===g));const review=JSON.stringify(picked.map(x=>({id:x.id,question:'この研究で何が確認されたのか',methodQuote:x.methods.slice(0,80),resultQuote:x.results.slice(0,80),limitQuote:x.discussion.slice(0,80)})));
 const q=await m.run({op:'advance',runId:p.runId,stage:'review',answer:review});assert(q.status==='prompt'&&q.stage==='draft','review');
 const draft={headline:'合成研究から学ぶ新しい視点',lead:'これは実データではない、既存機構の試験専用の合成導入です。',articles:picked.map((x,i)=>({category:'SCIENCE',title:'合成資料で確認する試験記事'+i,summary:'合成テスト用の記事であり、実在の研究内容を示すものではありません。確認処理のみを試験します。',reason:'合成資料によって既存読書版の保存処理を検査します。',action:'合成試験の手順を確認します。',caveat:'実在の研究結果ではないため一般化できません。',link:x.url}))};
 const draftText='【YOS_EDITORIAL_DRAFT_V1】\n【資料と照合状況】\n'+JSON.stringify(draft)+'\n【公開不可・要審査】';
 const f=await m.run({op:'advance',runId:p.runId,stage:'draft',answer:draftText});assert(f.status==='prompt'&&f.stage==='final','draft');
 const result=await m.run({op:'advance',runId:p.runId,stage:'final',answer:'YOS_FINAL_REVIEW_PASS_V1'});assert(result.status==='clarity_required'&&m.writes()===0,'final');
 const raw=result.payload.rawText,receipt='journal:'+digest(raw)+'-'+raw.length;
 assert((await m.run({op:'reflect',runId:p.runId,receipt:'bad'})).status==='hold'&&m.writes()===0,'wrong receipt');
 assert((await m.run({op:'reflect',runId:p.runId,receipt:'YOS_JOURNAL_NOTION_VERIFIED: mock\n'+receipt})).status==='hold'&&m.writes()===0,'fake receipt with no Inbox');
 m.setInbox([B('paragraph','2026-11-25T00:00:00.000Z · YOS JOURNAL Draft · '+receipt),...Array.from({length:Math.ceil(raw.length/1000)},(_,i)=>B('paragraph',raw.slice(i*1000,(i+1)*1000))),{type:'divider'}]);
 const done=await m.run({op:'reflect',runId:p.runId,receipt:'YOS_JOURNAL_NOTION_VERIFIED: mock\n'+receipt});assert(done.status==='verified'&&m.writes()===1,'reflect '+JSON.stringify(done));assert(JSON.stringify(m.history.slice(0,old.length))===JSON.stringify(old),'old history');
 const again=await m.run({op:'reflect',runId:p.runId,receipt:'YOS_JOURNAL_NOTION_VERIFIED: already saved\n'+receipt});assert(again.status==='verified'&&m.writes()===1,'retry '+JSON.stringify(again));
 const issued=await m.run({op:'prepare'});assert(issued.status==='hold'&&issued.reason.includes('TODAY_ALREADY_ISSUED'),'day guard');
 const noKey=mock({key:false});assert((await noKey.run({op:'prepare'})).status==='hold'&&noKey.publicRequests()===0,'no key');
 assert((await m.run({op:'advance',runId:'fake',stage:'final',answer:'YOS_FINAL_REVIEW_PASS_V1'})).status==='hold','session guard');
 return '12/12';
}

test('existing production adapter: synthetic original search to exact Clarity receipt, idempotent reading append and safety holds',async()=>assert.equal(await check(),'12/12'));
