import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const src=await readFile(new URL('../scriptable/YOS JOURNAL.js',import.meta.url),'utf8');
const web=await readFile(new URL('../../journal-v2/index.html',import.meta.url),'utf8');
const catalog=JSON.parse(await readFile(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const run=new (Object.getPrototypeOf(async function(){}).constructor)('Request','Keychain','WebView','FileManager','Safari','Script','args',src);
const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const old=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10);
const B=(type,t,url)=>({type,[type]:{rich_text:[{plain_text:t,...(url?{href:url}:{})}]}});
const mark='本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。';
const auto='本人用の非公開読書版。原著抜粋とGPTの執筆前・最終照合を実施。全文の独立審査は未実施。外部公開・配信は行っていない。';
function fixture(day,marker=mark){
 const rows=[B('heading_2','YOS JOURNAL｜'+day.replace(/-/g,'.')),B('paragraph','見出し </script><script>evil()</script>'),B('paragraph','合成導入'),B('paragraph',marker)];
 for(let n=1;n<=3;n++)rows.push({type:'divider'},B('heading_3','0'+n+' / SCIENCE｜合成記事'+n),B('paragraph','概要'),B('paragraph','根拠'),B('paragraph','日常への視点：行動'),B('paragraph','研究の限界：限界'),B('paragraph','原著論文','https://doi.org/10.1234/test'+day.replaceAll('-','')+n));
 rows.push({type:'divider'});return rows;
}
async function scenario({pages=[{results:[...fixture(today),...fixture(old)],has_more:false}],key=true,fail=false,cache=null,input=null}={}){
 let calls=[],out='',completed=0,opened=[],view;
 class R{constructor(url){this.url=url;calls.push(this);}async loadJSON(){if(fail)throw Error('network');this.response={statusCode:200};return pages[calls.length-1];}}
 class W{constructor(){view=this;}async loadHTML(s){out=s;}async present(){}}
 const fm={documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:()=>!!cache,readString:()=>JSON.stringify(cache),writeString:()=>{throw Error('must not write')}};
 await run(R,{contains:()=>key,get:()=>'mock-secret-123456'},W,{local:()=>fm},{open:u=>opened.push(u)},{complete:()=>completed++},{shortcutParameter:input});
 return {calls,out,packet:JSON.parse(out.match(/const packet=(.*);\n/)[1]),completed,view,opened};
}
const privateCount=r=>r.packet.editions.filter(e=>e.reviewScope==='private_original_checked').length;
test('fixed existing catalog name and exact source SHA',()=>{const e=catalog.targets.find(t=>t.id==='journal');assert.equal(e.name,'YOS JOURNAL');assert.equal(e.sha256,createHash('sha256').update(src).digest('hex'));});
test('exact existing Web stylesheet, no backend, no external scripts, no service worker',async()=>{
 const r=await scenario();
 assert.equal(r.out.match(/<style>([\s\S]*?)<\/style>/)[1],web.match(/<style>([\s\S]*?)<\/style>/)[1]);
 assert.doesNotMatch(r.out,/vercel\.app|serviceWorker|accounts\.google\.com|<script src=/);
 assert.match(r.out,/connect-src 'none'/);
 for(const m of r.out.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);
});
test('all verified private dates and public snapshot, exact native read only, injection escaped',async()=>{
 const r=await scenario();assert.equal(privateCount(r),2);
 assert.ok(r.packet.editions.some(e=>e.issuedOn==='2026-11-12'));
 assert.equal(r.calls.length,1);assert.equal(r.calls[0].method,'GET');assert.match(r.calls[0].url,/^https:\/\/api\.notion\.com\/v1\/blocks\//);
 assert.equal(r.calls[0].onRedirect(),null);assert.equal(r.completed,1);
 assert.doesNotMatch(r.out,/mock-secret-123456|evil\(\)<\/script>/);
 assert.ok(r.packet.editions.find(e=>e.issuedOn===today).headline.includes('evil()'));
});
test('all pages read; incomplete, duplicate, malformed or cyclic history rejected',async()=>{
 const b=[...fixture(today),...fixture(old)];
 const good=await scenario({pages:[{results:b.slice(0,9),has_more:true,next_cursor:'next'},{results:b.slice(9),has_more:false}]});
 assert.equal(privateCount(good),2);assert.equal(good.calls.length,2);
 for(const pages of [[{results:[...fixture(today),...fixture(today)],has_more:false}],[{results:fixture(today).slice(0,12),has_more:false}],[{results:fixture(today),has_more:true,next_cursor:'same'},{results:[],has_more:true,next_cursor:'same'}]]){
  const r=await scenario({pages});assert.equal(privateCount(r),0);assert.match(r.packet.status,/確認できません/);
 }
});
test('no key, no connection and legacy input remain safe and distinctly unreviewed',async()=>{
 const missing=await scenario({key:false});assert.equal(missing.calls.length,0);assert.equal(privateCount(missing),0);
 const offline=await scenario({fail:true});assert.match(offline.packet.status,/確認できません/);
 const input={issuedOn:today,articles:[1,2,3].map(i=>({title:'legacy'+i,link:'https://example.org/'+i}))};
 const legacy=await scenario({key:false,cache:input});assert.equal(legacy.packet.editions.find(e=>e.issuedOn===today).reviewScope,'legacy_unverified');
 const verified=await scenario({input});assert.equal(verified.packet.editions.find(e=>e.issuedOn===today).reviewScope,'private_original_checked');
});
test('auto-review limitations stay visible and source navigation allowlisted',async()=>{
 const r=await scenario({pages:[{results:fixture(today,auto),has_more:false}]});
 const e=r.packet.editions.find(e=>e.issuedOn===today);assert.equal(e.reviewScope,'gpt_original_excerpt_checked');
 const link=e.articles[0].link;
 assert.equal(r.view.shouldAllowRequest({url:'yos-journal-source:'+encodeURIComponent(link)}),false);assert.deepEqual(r.opened,[link]);
 assert.equal(r.view.shouldAllowRequest({url:'yos-journal-source:'+encodeURIComponent('https://evil.example/')}),false);
 assert.deepEqual(r.opened,[link]);assert.equal(r.view.shouldAllowRequest({url:'https://api.notion.com/'}),false);
});
