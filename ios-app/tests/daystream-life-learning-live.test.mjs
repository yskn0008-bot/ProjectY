import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url),'utf8');
const marker='// YOS_LIFE_LEARNING_LIVE_START';
const end='// YOS_LIFE_LEARNING_LIVE_END';
const segment=script.slice(script.indexOf(marker),script.indexOf(end)+end.length);
function node(tag='div'){
 return {tag,textContent:'',hidden:false,children:[],attributes:{},append(...a){this.children.push(...a)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attributes[k]=v}};
}
function render(items,status='ok'){
 const elements={yosLearningHints:node(),yosLearningRows:node(),yosLearningCoverage:node()};
 const document={getElementById:id=>elements[id],createElement:node};
 const invoked=[];
 const ctx={document,taskSource:{status},sourceTasks:items,todayISO:'2026-11-12',Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-12T12:01:00+09:00']))}},localISO:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),yosTaskRank:x=>({P0:0,P1:1,P2:2,P3:3}[x.priority]??4),yosPropose:(...args)=>invoked.push(args)};
 vm.runInNewContext(segment+'\nyosRenderLearningHints();',ctx);
 return {...elements,invoked};
}
const row=(id,title,due,status='次にやる',priority='P2')=>({id,title,due,status,priority});
test('DAYSTREAM learning panel and bounded CSS live in existing Scriptable, without new storage or Notion writes',()=>{
 assert.ok(script.includes('id="yosLearningHints"'));
 assert.match(script,/YOS_LIFE_LEARNING_LIVE_START/);
 assert.match(script,/\.yos-learning-live-row\{/);
 assert.match(script,/function yosRenderSources\(\)\{\s*yosRenderLearningHints\(\)/);
 assert.doesNotMatch(segment,/localStorage|fm\.write|Keychain|Authorization|CalendarEvent\.save/);
});
test('today and tomorrow safe due cards use source fields, original task remains immutable',()=>{
 const src=[row('a','購入手続き','2026-11-12'),row('b','ごみ出し','2026-11-13')],old=JSON.stringify(src);
 const x=render(src);
 assert.equal(x.yosLearningHints.hidden,false);
 assert.equal(x.yosLearningRows.children.length,2);
 assert.equal(x.yosLearningRows.children[0].children[1].textContent,'時間を提案');
 assert.match(x.yosLearningCoverage.textContent,/時刻は未確認/);
 assert.equal(JSON.stringify(src),old);
 x.yosLearningRows.children[0].children[1].onclick();
 assert.equal(x.invoked.length,1);
 assert.equal(x.invoked[0][1],'task');
});
test('invalid source and excluded tasks never show a fake completed reminder',()=>{
 for(const state of ['unavailable','error']){
   const x=render([row('x','a','2026-11-12')],state);
   assert.equal(x.yosLearningHints.hidden,true);
   assert.equal(x.yosLearningRows.children.length,0);
 }
 const x=render([row('a','完了','2026-11-12','完了'),row('b','保留','2026-11-13','保留'),row('c','待ち','2026-11-12','待ち'),row('d','期限外','2026-11-16')]);
 assert.equal(x.yosLearningHints.hidden,true);
});
test('untrusted titles are textContent, not executable HTML',()=>{
 const x=render([row('evil','<img src=x onerror=alert(1)>','2026-11-13')]);
 assert.equal(x.yosLearningRows.children[0].children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
 assert.doesNotMatch(segment,/innerHTML\s*=/);
});
test('three highest ranked records only, duplicate ID removed, partial source marked',()=>{
 const x=render([row('a','late','2026-11-13'),row('b','urgent','2026-11-12','次にやる','P0'),row('b','duplicate','2026-11-12'),row('c','third','2026-11-13'),row('d','fourth','2026-11-13')],'partial');
 assert.equal(x.yosLearningRows.children.length,3);
 assert.match(x.yosLearningCoverage.textContent,/一部取得/);
 assert.equal(x.yosLearningRows.children[0].children[0].children[0].textContent,'urgent');
});

test('deadline hint date recalculates from the device clock while screen stays open',()=>{
 assert.match(segment,/const date=new Date\(\),today=localISO\(date\)/);
 assert.match(script,/setInterval\(yosRenderLearningHints,60000\)/);
});
