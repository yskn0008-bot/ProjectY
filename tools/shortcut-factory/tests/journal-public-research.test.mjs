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
async function run({data={resultList:{result:[study]}},failure=false,input=''}={}){
  let result,completed=0,urls=[],timeouts=[];
  class Request{
    constructor(url){urls.push(url);this.url=url;}
    async loadJSON(){
      if(failure)throw new Error('network disabled');
      this.response={statusCode:200};
      return data;
    }
  }
  const Script={setShortcutOutput(x){result=x;},complete(){completed++;}};
  await new AsyncFunction('Request','Script','args',source)(Request,Script,{shortcutParameter:input});
  return {result,completed,urls,timeouts};
}
test('returns only real received abstract metadata with DOI URL',async()=>{
  const r=await run();
  assert.match(r.result,/YOS_RESEARCH_ABSTRACT_V1/);
  assert.match(r.result,/10.1038\/s41598-022-22866-x/);
  assert.match(r.result,/独立した意味照合は未実施/);
  assert.match(r.result,/自動公開禁止/);
  assert.equal(r.completed,1);
  assert.equal(r.urls.length,1);
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
  assert.equal(broken.result,'YOS_RESEARCH_HOLD_V1:SOURCE_UNAVAILABLE');
  assert.equal(broken.completed,1);
  const empty=await run({data:{resultList:{result:[]}}});
  assert.equal(empty.result,'YOS_RESEARCH_HOLD_V1:SOURCE_UNAVAILABLE');
  const weak=await run({data:{resultList:{result:[{...study,abstractText:'too short'}]}}});
  assert.equal(weak.result,'YOS_RESEARCH_HOLD_V1:SOURCE_UNAVAILABLE');
});
test('rejects source records lacking real DOI or PMID and implausible dates',async()=>{
  const fake={...study,doi:'javascript:evil',pmid:'bad',pubYear:'2099'};
  const r=await run({data:{resultList:{result:[fake]}}});
  assert.equal(r.result,'YOS_RESEARCH_HOLD_V1:SOURCE_UNAVAILABLE');
});
