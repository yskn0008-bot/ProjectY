import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../journal_public_research_inline.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const b=(type,t,url)=>({type,[type]:{rich_text:[{plain_text:t,...(url?{href:url}:{})}]}});
function historyFixture(dois=['10.1234/old1','10.1234/old2','10.1234/old3']){
 const list=[b('heading_2','YOS JOURNAL｜'+new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10).replace(/-/g,'.')),b('paragraph','見出し'),b('paragraph','導入'),b('paragraph','本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。')];
 for(let i=1;i<=3;i++)list.push({type:'divider'},b('heading_3','0'+i+' / CULTURE｜記事'),...['概要','本文','日常への視点','研究の限界'].map(t=>b('paragraph',t)),b('paragraph','原著論文','https://doi.org/'+dois[i-1]));
 list.push({type:'divider'},b('paragraph','UNRELATED PRIVATE CONTENT'));return list;
}
const make=(i)=>({doi:'10.1234/study'+i,pmcid:'PMC1234'+String(i).padStart(2,'0'),pubYear:'2025'});
const textFor=s=>('Synthetic '+s+' passage containing sufficient methodological details, study conditions, and limitations for a test fixture. ').repeat(6);
function xml(r,{noBody=false,mismatch=false,noDiscussion=false,articleType='research-article',noPmc=false}={}){
 return '<article article-type="'+articleType+'"><front><article-meta><article-id pub-id-type="doi">'+(mismatch?'10.9999/wrong':r.doi)+'</article-id>'+ (noPmc?'':'<article-id pub-id-type="pmc">'+r.pmcid.slice(3)+'</article-id>')+'<article-title>Original source synthetic article for testing</article-title></article-meta></front>'+
 (noBody?'':'<body><sec><title>Methods</title><p>'+textFor('methods')+'</p></sec><sec><title>Results</title><p>'+textFor('results')+'</p></sec>'+(noDiscussion?'':'<sec><title>Discussion</title><p>'+textFor('discussion')+'</p></sec>')+'</body>')+'</article>';
}
async function run({history=historyFixture(),historyError=false,key=true,historyPages=null,searchError=false,fullError=false,mutate=null,duplicate=false,input='PRIVATE USER INPUT',rows=4}={}){
 let out,completed=0,reads=0,publicUrls=[],authLeak=false,search=0;const records=new Map();
 class Request{
  constructor(url){this.url=url;}
  async loadJSON(){
   this.response={statusCode:200};
   if(this.url.startsWith('https://api.notion.com/')){
    reads++;assert.equal(this.headers.Authorization,'Bearer mock-existing-key');
    if(historyError)throw Error('history error');
    return historyPages?historyPages[reads-1]:{results:history,has_more:false};
   }
   publicUrls.push(this.url);if(this.headers?.Authorization)authLeak=true;if(searchError)throw Error('network');
   const group=search++;
   const rr=Array.from({length:rows},(_,i)=>make(duplicate?i:group*10+i+1));
   rr.forEach(r=>records.set(r.pmcid,r));
   return {resultList:{result:rr}};
  }
  async loadString(){
   publicUrls.push(this.url);if(this.headers?.Authorization)authLeak=true;
   this.response={statusCode:200};
   if(fullError)throw Error('full text unavailable');
   const pmc=/\/(PMC\d+)\/fullTextXML$/.exec(this.url)?.[1];
   const r=records.get(pmc);if(!r)throw Error('wrong endpoint');
   return xml(r,mutate?mutate(r):{});
  }
 }
 await new AsyncFunction('Request','Script','args','Keychain',source)(Request,{setShortcutOutput:x=>out=x,complete:()=>completed++},{shortcutParameter:input},{contains:()=>key,get:()=> 'mock-existing-key'});
 return {out,completed,reads,publicUrls,authLeak};
}
const pool=r=>JSON.parse(r.out.split('\n').slice(1).join('\n'));
test('retrieves original sections for six candidates with no personal input or credentials in public requests',async()=>{
 const r=await run();
 assert.match(r.out,/^YOS_RESEARCH_FULLTEXT_POOL_V1\n/);
 assert.equal(pool(r).length,6);
 assert.ok(pool(r).every(x=>x.methods&&x.results&&x.discussion));
 assert.equal(new Set(pool(r).map(x=>x.group)).size,3);
 assert.equal(r.completed,1);assert.equal(r.publicUrls.length,9);
 assert.equal(r.authLeak,false);assert.ok(!r.publicUrls.join().includes('PRIVATE USER INPUT'));assert.ok(!r.out.includes('UNRELATED PRIVATE CONTENT'));
});
test('reviewed DOI excluded case-insensitively before full-text fetch',async()=>{
 const r=await run({history:historyFixture(['10.1234/STUDY1','10.1234/old2','10.1234/old3'])});
 assert.ok(!pool(r).some(x=>x.doi==='10.1234/study1'));
 assert.ok(!r.publicUrls.some(x=>x.includes('PMC123401/fullTextXML')));
});
test('replaces a candidate whose original XML is a mismatch or missing body',async()=>{
 const r=await run({mutate:x=>x.doi==='10.1234/study1'?{mismatch:true}:x.doi==='10.1234/study11'?{noBody:true}:{}});
 assert.equal(pool(r).length,6);
 assert.ok(!pool(r).some(x=>['10.1234/study1','10.1234/study11'].includes(x.doi)));
 assert.ok(r.publicUrls.some(x=>x.includes('PMC123403/fullTextXML')));
});
test('no abstract-only, missing methods/results/discussion, correction or retraction substitution',async()=>{
 for(const opt of [{fullError:true},{mutate:()=>({noDiscussion:true})},{mutate:()=>({articleType:'retraction'})},{mutate:()=>({noPmc:true})},{searchError:true}]){
  const r=await run(opt);assert.equal(r.out,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');assert.equal(r.completed,1);assert.ok(r.publicUrls.length<=21);
 }
});
test('unreadable or incomplete history holds before public access',async()=>{
 for(const opt of [{key:false},{historyError:true},{history:[]},{history:historyFixture().slice(0,10)}]){
  const r=await run(opt);assert.equal(r.out,'YOS_RESEARCH_HOLD_V1:REVIEWED_HISTORY_UNAVAILABLE');assert.equal(r.publicUrls.length,0);
 }
});
test('complete paginated history remains supported',async()=>{
 const h=historyFixture();const r=await run({historyPages:[{results:h.slice(0,8),has_more:true,next_cursor:'next'},{results:h.slice(8),has_more:false}]});
 assert.equal(r.reads,2);assert.equal(pool(r).length,6);
});
test('same DOI across search topics is not sent twice',async()=>{
 const r=await run({duplicate:true,rows:1});assert.equal(r.out,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');
 assert.equal(r.publicUrls.filter(x=>x.endsWith('fullTextXML')).length,1);
});

test('already-issued JST day stops before public retrieval and before either GPT call',async()=>{
 const h=historyFixture();h[0].heading_2.rich_text[0].plain_text='YOS JOURNAL｜'+new Date(Date.now()+9*3600000).toISOString().slice(0,10).replace(/-/g,'.');
 const r=await run({history:h});assert.equal(r.out,'YOS_RESEARCH_HOLD_V1:TODAY_ALREADY_ISSUED');assert.equal(r.publicUrls.length,0);
});
test('capacity preflight stops before public retrieval without losing old content',async()=>{
 const h=historyFixture();while(h.length<2980)h.push(b('paragraph','unrelated'));
 const r=await run({history:h});assert.equal(r.out,'YOS_RESEARCH_HOLD_V1:READING_CAPACITY');assert.equal(r.publicUrls.length,0);
});
