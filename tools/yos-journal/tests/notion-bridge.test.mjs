import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../YOS Journal Notion Bridge.js',import.meta.url),'utf8');
async function harness(options={}){
  const calls=[],pages=structuredClone(options.pages||[]);
  const context={args:{shortcutParameter:null,queryParameters:{}},Intl,Date,
    Data:{fromBase64String:s=>({toRawString:()=>Buffer.from(s,'base64').toString('utf8')})},
    Keychain:{contains:()=>options.auth!==false,get:()=> 'isolated-test-token'},
    Request:class{
      constructor(url){this.path=url.replace('https://api.notion.com/v1','');this.method='GET';this.response={statusCode:200}}
      async loadJSON(){
        const body=this.body?JSON.parse(this.body):undefined;calls.push({path:this.path,method:this.method,body});
        if(options.httpFailure){this.response.statusCode=503;return {}}
        if(this.path.endsWith('/query'))return {results:structuredClone(pages),has_more:!!options.hasMore};
        if(this.path==='/pages'&&this.method==='POST'){const p={id:'created',properties:body.properties};pages.push(p);return structuredClone(p)}
        const page=pages.find(p=>this.path==='/pages/'+p.id);assert.ok(page,'unexpected page request');
        if(this.method==='PATCH'){Object.assign(page.properties,body.properties);return structuredClone(page)}
        return options.badReadback?{id:page.id,properties:{}}:structuredClone(page);
      }
    }};
  const api=await vm.runInNewContext('(async()=>{'+source.replace('await main();','return {safeInput,tokyoDay,persist,chooseEntry};')+'})()',context);
  const item={date:api.tokyoDay(),diary:'編集後の日本語の日記',question:'今日の問い',answer:'本人の回答'};
  return {api,item,calls,pages,context};
}
const rich=value=>({rich_text:[{text:{content:value}}]});
const row=(id,key,origin='手動',body='以前の本文')=>({id,properties:{'記録キー':rich(key),'記録元':{select:{name:origin}},'本文':rich(body),'今日の問い':rich(''),'問いへの答え':rich('')}});
const writes=calls=>calls.filter(x=>x.method==='POST'&&x.path==='/pages'||x.method==='PATCH');

test('Shortcut JSON and base64 query preserve Japanese text; invalid dates and empty fields stop',async()=>{
  const h=await harness();h.context.args.shortcutParameter=JSON.stringify(h.item);assert.equal(h.api.safeInput().diary,h.item.diary);
  h.context.args.shortcutParameter=null;h.context.args.queryParameters={date:h.item.date,...Object.fromEntries(['diary','question','answer'].map(k=>[k,Buffer.from(h.item[k]).toString('base64')]))};
  assert.equal(h.api.safeInput().answer,h.item.answer);
  h.context.args.shortcutParameter={...h.item,date:'2000-01-01'};assert.throws(()=>h.api.safeInput(),/日付/);
  h.context.args.shortcutParameter={...h.item,answer:''};assert.throws(()=>h.api.safeInput(),/揃って/);assert.equal(h.calls.length,0);
});
test('missing device credential stops before any request',async()=>{
  const h=await harness({auth:false});await assert.rejects(h.api.persist(h.item),/認証/);assert.equal(h.calls.length,0);
});
test('new diary is written with existing schema and read back; same input retry writes once',async()=>{
  const h=await harness();const result=await h.api.persist(h.item);assert.equal(result.mode,'created');
  assert.equal(writes(h.calls).length,1);const payload=writes(h.calls)[0].body;
  assert.equal(payload.parent.data_source_id,'fe0e0973-d1cc-4bde-b138-1cb1da64ac68');
  assert.equal(payload.properties['記録元'].select.name,'手動');assert.equal(payload.properties['問いへの答え'].rich_text[0].text.content,h.item.answer);
  assert.equal(h.calls.at(-1).method,'GET');
  await h.api.persist(h.item);assert.equal(writes(h.calls).length,1,'retry must not create or append duplicate');
});
test('append preserves prior body and ignores Clarity rows; retry does not append twice',async()=>{
  const h=await harness({pages:[row('clarity','journal:old','Clarity'),row('night','night:today')]});
  await h.api.persist(h.item);assert.equal(writes(h.calls).length,1);assert.equal(writes(h.calls)[0].path,'/pages/night');
  assert.equal(h.pages[0].properties['本文'].rich_text[0].text.content,'以前の本文');
  assert.match(h.pages[1].properties['本文'].rich_text[0].text.content,/以前の本文[\s\S]*編集後の日本語/);
  await h.api.persist(h.item);assert.equal(writes(h.calls).length,1);
});
test('incomplete query and HTTP failure cannot create or change a diary',async()=>{
  for(const options of [{hasMore:true},{httpFailure:true}]){const h=await harness(options);await assert.rejects(h.api.persist(h.item));assert.equal(writes(h.calls).length,0)}
});
test('failed readback is an explicit failure and does not immediately retry the write',async()=>{
  const h=await harness({badReadback:true});await assert.rejects(h.api.persist(h.item),/読み戻/);assert.equal(writes(h.calls).length,1);
});
