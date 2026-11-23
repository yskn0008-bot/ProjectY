import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../../journal-v2/widgy.html',import.meta.url),'utf8');
const script=html.split('<script>')[1]?.split('</script>')[0];
assert.ok(script,'inline widget script exists');

class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.attrs={};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 setAttribute(k,v){this.attrs[k]=v;}
}
async function render(fetcher){
 const ids={list:new Element('section'),count:new Element('b'),status:new Element('span')};
 const document={createElement:t=>new Element(t),getElementById:id=>ids[id]};
 const context=vm.createContext({document,fetch:fetcher,AbortController,Intl,Date,
   setTimeout:()=>1,clearTimeout:()=>{}});
 new vm.Script(script).runInContext(context);
 for(let i=0;i<22;i++)await Promise.resolve();
 return ids;
}
const getNames=ids=>ids.list.children.map(r=>r.children[1].children[1].textContent);

test('publication index displays exactly 5 real headlines in reader order',async()=>{
 let url;
 const ids=await render(async u=>{url=u;return{ok:true,json:async()=>({editions:[{
  issuedOn:'2026-11-19',articles:[{title:'A'},{title:'B'},{title:'C'},{title:'D'},{title:'E'},{title:'F'}]}]})}});
 assert.equal(url,'./archive-index.json');
 assert.deepEqual(getNames(ids),['A','B','C','D','E']);
 assert.equal(ids.count.textContent,'5記事の見出し');
 assert.equal(ids.status.textContent,'公開データ取得済み');
 assert.ok(ids.list.children.every(x=>x.href.includes('#archive-2026-11-19-')));
});

test('offline fallback labels historical issue as unverified, never as today',async()=>{
 const ids=await render(async()=>{throw Error('network unavailable');});
 assert.equal(ids.list.children.length,5);
 assert.equal(ids.status.textContent,'保存済み見本／更新未確認');
 assert.deepEqual(ids.list.children.map(x=>x.href.match(/#archive-(2026-11-\d{2})-/)?.[1]),['2026-11-19','2026-11-19','2026-11-19','2026-11-18','2026-11-18']);
});

test('journal UI and device local storage are protected',()=>{
 assert.match(html,/background:#fff/);
 assert.doesNotMatch(html,/localStorage|method\s*:\s*['"](?:POST|PATCH|DELETE)/);
 assert.match(html,/JOURNALを開く/);
 assert.match(html,/最新公開記事/);
});

test('five items retain original web typography, thumbnail size and no artificial J placeholders',()=>{
 assert.match(html,/font-size:17px;line-height:1\.48;font-weight:700/);
 assert.match(html,/width:107px;height:85px/);
 assert.match(html,/font-size:11px;color:#666/);
 assert.match(html,/shown<5/);
 assert.doesNotMatch(html,/el\('div','blank','J'\)/);
});
