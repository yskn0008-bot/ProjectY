import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('./habit-flow-designer.html', import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
function boot(stored){
 const actions={};const nodes={};const memory=new Map(stored?[[ 'yos-habit-flow-draft-v1',stored ]]:[]);
 function element(id){return nodes[id]??(nodes[id]={
  value:'',innerHTML:'',textContent:'',dataset:{},open:false,
  classList:{add(){},remove(){}},
  addEventListener(name,fn){(actions[id]??={})[name]=fn},
  setAttribute(){},showModal(){this.open=true},close(){this.open=false},
  focus(){},select(){}
 });}
 const tabs=['daily','weekly','monthly','yearly'].map(p=>{const b=element('tab:'+p);b.dataset.period=p;return b;});
 const document={getElementById:element,querySelectorAll:q=>q==='[data-period]'?tabs:[],
  createElement:()=>element('textarea'),body:{append(){}},elementFromPoint:()=>null};
 const localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const navigator={clipboard:{writeText:async value=>{memory.set('copied',value)}}};
 runInNewContext(script,{document,localStorage,navigator,confirm:()=>true});
 return {actions,nodes,memory};
}
test('HTML is standalone, mobile-friendly and does not call external APIs',()=>{
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/<dialog id="info">/);
 assert.ok(script.length>4000);
 assert.doesNotMatch(script,/fetch\s*\(|XMLHttpRequest|WebSocket|api\.notion\.com/);
});
test('each frequency shows the planned anchor sequence',()=>{
 const x=boot();
 assert.match(x.nodes.timeline.innerHTML,/起床・アラーム停止/);
 assert.equal(x.nodes.count.textContent,'12項目');
 x.actions['tab:weekly'].click();
 assert.match(x.nodes.timeline.innerHTML,/筋トレ（週2日）/);
 assert.equal(x.nodes.count.textContent,'4項目');
 x.actions['tab:monthly'].click();
 assert.equal(x.nodes.count.textContent,'2項目');
 x.actions['tab:yearly'].click();
 assert.match(x.nodes.timeline.innerHTML,/眉毛3か月育成/);
});
test('recommendations can be added and moved without changing the native planner key',()=>{
 const x=boot();
 x.actions['tab:weekly'].click();
 x.actions.suggestions.click({target:{closest:q=>q==='button[data-add]'?{dataset:{add:'mealreview'}}:null}});
 assert.equal(x.nodes.count.textContent,'5項目');
 x.actions.timeline.click({target:{closest:q=>q==='button'?{dataset:{move:'mealreview',dir:'-1'}}:null}});
 const value=JSON.parse(x.memory.get('yos-habit-flow-draft-v1'));
 assert.equal(value.lists.weekly[3],'mealreview');
 assert.equal(x.memory.has('yos-daystream-plan-v1'),false);
});
test('user text is escaped and reopening preserves the saved sequence',()=>{
 const x=boot();
 x.nodes.newTitle.value='<img src=x onerror=alert(1)>';
 x.actions.add.click();
 assert.match(x.nodes.timeline.innerHTML,/&lt;img/);
 assert.doesNotMatch(x.nodes.timeline.innerHTML,/<img src=x onerror=/);
 const y=boot(x.memory.get('yos-habit-flow-draft-v1'));
 assert.match(y.nodes.timeline.innerHTML,/&lt;img/);
 assert.equal(y.nodes.count.textContent,'13項目');
});
test('malformed local draft does not overwrite previous live records',()=>{
 const x=boot('{broken');
 assert.equal(x.nodes.count.textContent,'12項目');
 assert.equal(x.memory.get('yos-habit-flow-draft-v1'),'{broken');
});
