import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const source=await readFile(new URL('../journal_public_research_inline.js',import.meta.url),'utf8');
const study={
  title:'Perceived facial attractiveness and experimental immune response',
  abstractText:'The first study evaluated the association between ratings of facial attractiveness and measured immune response under experimentally controlled conditions. '.repeat(5),
  pubYear:'2022',doi:'10.1038/s41598-022-22866-x',pmid:'36319732'
};

const HISTORY_MARK='本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。';
const block=(type,t,url)=>({type,[type]:{rich_text:[{plain_text:t,...(url?{href:url}:{})}]}});
function historyFixture(dois=['10.1234/old1','10.1234/old2','10.1234/old3']){
 const list=[block('heading_2','YOS JOURNAL｜2026.11.24 TUE'),block('paragraph','見出し'),block('paragraph','導入'),block('paragraph',HISTORY_MARK)];
 for(let i=1;i<=3;i++)list.push({type:'divider'},block('heading_3','0'+i+' / CULTURE｜記事'),...['概要','本文','日常への視点','研究の限界'].map(t=>block('paragraph',t)),block('paragraph','原著論文','https://doi.org/'+dois[i-1]));
 list.push({type:'divider'},block('paragraph','UNRELATED PRIVATE CONTENT'));
 return list;
}

async function run({data={resultList:{result:[study]}},failure=false,input='',fallback=false,cache=null,duplicate=false,editorial=false,history=historyFixture(),historyError=false,key=true,historyPages=null}={}){
  let result,completed=0,urls=[],timeouts=[],historyReads=0,authLeak=false;
  class Request{
    constructor(url){this.url=url;if(!url.startsWith('https://api.notion.com/'))urls.push(url);this.index=urls.length-1;}
    async loadString(){
      timeouts.push(this.timeoutInterval);
      if(!editorial)throw Error('feed unavailable');
      this.response={statusCode:200};
      const host=this.url.includes('guardian')?'www.theguardian.com':'www.bbc.com';
      return '<rss><channel>'+[1,2,3].map(n=>'<item><title>Example science editorial article '+n+'</title><description>'+study.abstractText+'</description><link>https://'+host+'/science/test-'+n+'</link><pubDate>'+new Date().toUTCString()+'</pubDate></item>').join('')+'</channel></rss>';
    }
    async loadJSON(){
      if(this.url.startsWith('https://api.notion.com/')){
        historyReads++;
        assert.equal(this.headers.Authorization,'Bearer mock-existing-key');
        if(historyError)throw Error('Notion unavailable');
        this.response={statusCode:200};
        if(historyPages){const page=historyPages[historyReads-1];if(!page)throw Error('unexpected history page');return page;}
        return {results:history,has_more:false};
      }
      if(this.headers?.Authorization)authLeak=true;
      timeouts.push(this.timeoutInterval);
      if(failure)throw new Error('network disabled');
      if(fallback){
        if(this.url.includes('ebi.ac.uk'))throw new Error('Europe PMC timeout');
        this.response={statusCode:200};
        return {message:{items:[{title:[study.title],abstract:study.abstractText,
          published:{'date-parts':[[2022,11,1]]},DOI:study.doi+'-'+this.index,type:'journal-article'}]}};
      }
      this.response={statusCode:200};
      return {resultList:{result:(data.resultList?.result||[]).map(x=>({...x,doi:duplicate?x.doi:x.doi+'-'+this.index}))}};
    }
  }
  const Script={setShortcutOutput(x){result=x;},complete(){completed++;}};
  const FileManager={local(){
    if(!cache)throw new Error('No local filesystem mock');
    return {
      documentsDirectory(){return '/local';},
      joinPath(a,b){return a+'/'+b;},
      fileExists(p){return cache.has(p);},
      readString(p){return cache.get(p);},
      writeString(p,v){cache.set(p,v);}
    };
  }};
  await new AsyncFunction('Request','Script','args','FileManager','Keychain',source)(Request,Script,{shortcutParameter:input},FileManager,{contains:()=>key,get:()=> 'mock-existing-key'});
  return {result,completed,urls,timeouts,historyReads,authLeak};
}
test('returns only real received abstract metadata with DOI URL',async()=>{
  const r=await run();
  assert.match(r.result,/YOS_RESEARCH_ABSTRACT_V1/);
  assert.match(r.result,/10.1038\/s41598-022-22866-x/);
  assert.match(r.result,/独立した意味照合は未実施/);
  assert.equal((r.result.match(/^資料[123]｜/gm)||[]).length,3);
  assert.match(r.result,/自動公開禁止/);
  assert.equal(r.completed,1);
  assert.equal(r.urls.length,3);
  assert.match(r.urls[0],/^https:\/\/www\.ebi\.ac\.uk\/europepmc\/webservices\/rest\/search\?/);
});
test('does not transmit user-provided private shortcut input in API URL or final notes',async()=>{
  const secret='住民票と連絡先番号: secret-do-not-send';
  const r=await run({input:secret});
  assert.ok(!r.urls[0].includes(secret));
  assert.ok(!r.result.includes(secret));
});
test('fail closed on networking, empty source and missing abstract',async()=>{
  const broken=await run({failure:true});
  assert.equal(broken.result,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');
  assert.equal(broken.completed,1);
  const empty=await run({data:{resultList:{result:[]}}});
  assert.equal(empty.result,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');
  const weak=await run({data:{resultList:{result:[{...study,abstractText:'too short'}]}}});
  assert.equal(weak.result,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');
});
test('rejects source records lacking real DOI or PMID and implausible dates',async()=>{
  const fake={...study,doi:'javascript:evil',pmid:'bad',pubYear:'2099'};
  const r=await run({data:{resultList:{result:[fake]}}});
  assert.equal(r.result,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');
});

test('uses publisher-deposited Crossref abstract only if Europe PMC unavailable',async()=>{
  const r=await run({fallback:true,input:'家計残高などの非公開情報'});
  assert.match(r.result,/YOS_RESEARCH_ABSTRACT_V1/);
  assert.match(r.result,/Crossref公式REST/);
  assert.match(r.result,/全文未確認/);
  assert.equal(r.urls.length,8);
  assert.match(r.urls[3],/^https:\/\/api\.crossref\.org\/works\?/);
  assert.ok(!r.urls.join(' ').includes('家計残高'));
});

test('repeated run on same JST day reuses public-only cache without another network request',async()=>{
  const cache=new Map();
  const first=await run({cache});
  assert.match(first.result,/YOS_RESEARCH_ABSTRACT_V1/);
  assert.equal(first.urls.length,3);
  assert.equal(first.completed,1);
  assert.equal(cache.size,1);
  const second=await run({failure:true,cache,input:'非公開メモ'});
  assert.equal(second.result,first.result);
  assert.equal(second.urls.length,0);
  assert.equal(second.historyReads,1);
  assert.equal(second.completed,1);
  assert.ok(!second.result.includes('非公開メモ'));
});
test('research request total timeout budget is limited to 7s and fails closed',async()=>{
  const r=await run({failure:true});
  assert.equal(r.result,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');
  assert.equal(r.completed,1);
  assert.equal(r.timeouts.length,8);
  assert.ok(r.timeouts.slice(0,3).every(x=>x<=4) && r.timeouts.slice(3).every(x=>x<=3));
});
test('tampered or malformed local source cache is ignored',async()=>{
  const cache=new Map([['/local/YOS JOURNAL Public Abstract Cache V1.json','{"day":"broken","notes":"YOS_RESEARCH_ABSTRACT_V1"}']]);
  const r=await run({failure:true,cache});
  assert.equal(r.result,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');
  assert.equal(r.completed,1);
});

test('duplicate DOI across topics never produces three articles',async()=>{const r=await run({duplicate:true});assert.match(r.result,/^YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE/);assert.match(r.result,/YOS_RESEARCH_PARTIAL_V1/);assert.doesNotMatch(r.result,/YOS_RESEARCH_ABSTRACT_V1/);});

test('editorial RSS fallback works without academic DOI',async()=>{const r=await run({failure:true,editorial:true});assert.match(r.result,/YOS_RESEARCH_ABSTRACT_V1/);assert.equal((r.result.match(/^出典リンク: https:/gm)||[]).length,3);assert.match(r.result,/本文未確認/);});

test('previously reviewed DOI is excluded case-insensitively and public providers never receive credentials',async()=>{
 const old=study.doi+'-0';
 const r=await run({history:historyFixture([old.toUpperCase(),'10.1234/old2','10.1234/old3'])});
 assert.doesNotMatch(r.result,new RegExp('論文リンク: https://doi.org/'+old+'\\n','i'));
 assert.equal(r.authLeak,false);
 assert.equal(r.historyReads,1);
 assert.ok(!r.result.includes('UNRELATED PRIVATE CONTENT'));
});
test('history must be readable, complete and authenticated before cached or fresh research',async()=>{
 const cache=new Map();
 const first=await run({cache});assert.match(first.result,/^YOS_RESEARCH_ABSTRACT_V1/);
 for(const option of [{historyError:true},{key:false},{history:historyFixture().slice(0,10)},{history:[]}]){
  const r=await run({...option,cache});
  assert.equal(r.result,'YOS_RESEARCH_HOLD_V1:REVIEWED_HISTORY_UNAVAILABLE');
  assert.equal(r.urls.length,0);
 }
});
test('a complete paginated reviewed history is read before the public request',async()=>{
 const h=historyFixture();
 const r=await run({historyPages:[{results:h.slice(0,8),has_more:true,next_cursor:'next'},{results:h.slice(8),has_more:false}]});
 assert.equal(r.historyReads,2);
 assert.match(r.result,/^YOS_RESEARCH_ABSTRACT_V1/);
});
test('cache is invalidated when an edition using its DOI is reviewed',async()=>{
 const cache=new Map(),first=await run({cache});
 const doi=/論文リンク: https:\/\/doi\.org\/([^\s]+)/.exec(first.result)[1];
 const r=await run({cache,history:historyFixture([doi,'10.1234/old2','10.1234/old3'])});
 assert.notEqual(r.result,first.result);
 assert.ok(!(r.result.match(/^論文リンク: .+$/gm)||[]).some(x=>x.endsWith('/'+doi)));
 assert.ok(r.urls.length>0);
});
