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
async function run({data={resultList:{result:[study]}},failure=false,input='',fallback=false,cache=null,duplicate=false,editorial=false}={}){
  let result,completed=0,urls=[],timeouts=[];
  class Request{
    constructor(url){urls.push(url);this.url=url;this.index=urls.length-1;}
    async loadString(){
      timeouts.push(this.timeoutInterval);
      if(!editorial)throw Error('feed unavailable');
      this.response={statusCode:200};
      const host=this.url.includes('guardian')?'www.theguardian.com':'www.bbc.com';
      return '<rss><channel>'+[1,2,3].map(n=>'<item><title>Example science editorial article '+n+'</title><description>'+study.abstractText+'</description><link>https://'+host+'/science/test-'+n+'</link><pubDate>'+new Date().toUTCString()+'</pubDate></item>').join('')+'</channel></rss>';
    }
    async loadJSON(){
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
  await new AsyncFunction('Request','Script','args','FileManager',source)(Request,Script,{shortcutParameter:input},FileManager);
  return {result,completed,urls,timeouts};
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
  assert.equal(r.urls.length,6);
  assert.match(r.urls[3],/^https:\/\/api\.crossref\.org\/works\?/);
  assert.ok(!r.urls.join(' ').includes('家計残高'));
});

test('repeated run on same UTC day reuses public-only cache without another network request',async()=>{
  const cache=new Map();
  const first=await run({cache});
  assert.match(first.result,/YOS_RESEARCH_ABSTRACT_V1/);
  assert.equal(first.urls.length,3);
  assert.equal(first.completed,1);
  assert.equal(cache.size,1);
  const second=await run({failure:true,cache,input:'非公開メモ'});
  assert.equal(second.result,first.result);
  assert.equal(second.urls.length,0);
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

test('duplicate DOI across topics never produces three articles',async()=>{const r=await run({duplicate:true});assert.equal(r.result,'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE');});

test('editorial RSS fallback works without academic DOI',async()=>{const r=await run({failure:true,editorial:true});assert.match(r.result,/YOS_RESEARCH_ABSTRACT_V1/);assert.equal((r.result.match(/^出典リンク: https:/gm)||[]).length,3);assert.match(r.result,/本文未確認/);});
