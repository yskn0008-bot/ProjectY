import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../journal_review_selection_inline.js',import.meta.url),'utf8');
const A=Object.getPrototypeOf(async function(){}).constructor;
const pool=Array.from({length:6},(_,i)=>({id:'S'+(i+1),group:i%3,doi:'10.1234/test'+i,url:'https://doi.org/10.1234/test'+i,pmcid:'PMC12345'+i,year:2025,title:'Synthetic candidate '+i,methods:'Methods evidence exact excerpt with sufficient character length.',results:'Results evidence exact excerpt with sufficient character length.',discussion:'Discussion evidence exact excerpt with sufficient character length.'}));
const selected=[pool[3],pool[1],pool[5]].map(r=>({id:r.id,question:'研究の結果と限界を考える',methodQuote:r.methods,resultQuote:r.results,limitQuote:r.discussion}));
async function run(p=pool,s=selected){
 let out,completed=0;await new A('args','Script',src)({shortcutParameter:'YOS_RESEARCH_FULLTEXT_POOL_V1\n'+JSON.stringify(p)+'\n<<YOS_REVIEW_SELECTION_V1>>\n'+JSON.stringify(s)},{setShortcutOutput:x=>out=x,complete:()=>completed++});
 assert.equal(completed,1);return out;
}
test('selects reserve sources and binds each original passage before writing',async()=>{
 const out=await run();assert.match(out,/^YOS_RESEARCH_APPROVED_V1/);assert.ok(!out.includes('test0'));assert.equal((out.match(/^論文リンク: /gm)||[]).length,3);assert.match(out,/自動公開禁止/);
});
test('missing duplicate or unknown source selection refuses writing',async()=>{
 for(const s of [selected.slice(0,2),[selected[0],selected[0],selected[2]],[{...selected[0],id:'S99'},...selected.slice(1)],[selected[0],{...selected[1],id:'S1'},selected[2]]])assert.equal(await run(pool,s),'YOS_REVIEW_HOLD_V1');
});
test('fabricated or altered original passages refuse writing',async()=>{
 for(const field of ['methodQuote','resultQuote','limitQuote'])assert.equal(await run(pool,[{...selected[0],[field]:'fabricated sentence not in original source at all'},...selected.slice(1)]),'YOS_REVIEW_HOLD_V1');
});
