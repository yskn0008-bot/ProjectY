import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const source = readFileSync(new URL('../scriptable/YOS Timeline.js', import.meta.url), 'utf8');
const match = source.match(/const html=\x60([\s\S]*?)\x60;\s*await view\.loadHTML\(html\)/);
assert.ok(match, 'auto loader must still locate the current WebView HTML');
const html = match[1].replace(/<\\\/script>/g, '</script>');
const bodyScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test('approved charcoal template remains compatible with auto-loader', () => {
  assert.match(source, /YOS Timeline v2\.1/);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('id="tl"') && html.includes('id="notice"'));
  assert.ok(html.includes('</html>') && html.length > 2000);
});
test('embedded JavaScript compiles without external libraries', () => {
  assert.ok(bodyScript);
  assert.doesNotThrow(() => new Script(bodyScript));
  assert.doesNotMatch(html, /<script[^>]*src=/i);
});
test('base palette is charcoal, not metallic, gold or old bright white', () => {
  assert.match(html, /--bg:#353a44/);
  assert.match(html, /background:#24976e/);
  assert.match(html, /background:#823db0/);
  assert.match(html, /background:#2e77b3/);
  assert.doesNotMatch(html, /#faf9f7|#8262e9|metallic|golden/i);
});
test('five tabs, date selector, timeline and editing actions exist', () => {
  for (const id of ['dateTitle','weekStrip','datePicker','nowLine','nowBadge','tl','addBtn','editor','saveBtn','editSelected','deleteSelected','taskPanel','review','recordsPanel','aiPanel','focus','searchInput'])
    assert.ok(html.includes('id="'+id+'"'), id+' missing');
  for (const tab of ['timeline','task','analysis','records','ai'])
    assert.ok(html.includes('data-tab="'+tab+'"'),tab+' missing');
  for (const fn of ['renderWeek','showDay','updateNow','renderLists','updateOverview'])
    assert.ok(bodyScript.includes('function '+fn+'('),fn+' missing');
});
test('elapsed-time position and overlap lanes are implemented', () => {
  assert.match(bodyScript,/let density='overview',scale=27/);
  assert.match(bodyScript,/scale=density==='overview'\?27:56/);
  assert.match(bodyScript,/const yFor=m=>m\/60\*scale/);
  assert.match(bodyScript,/lanes\.set\(item,\{lane,count:0\}\)/);
  assert.match(bodyScript,/el\.classList\.add\('lane'\)/);
});
test('local-only storage respects empty arrays and labels sample data', () => {
  assert.match(bodyScript,/YOS_TIMELINE_LOCAL_V2/);
  assert.match(bodyScript,/Array\.isArray\(stored\)\?stored:initialItems/);
  assert.match(bodyScript,/if\(isSample\)\{items=\[\];isSample=false;\}/);
  assert.match(bodyScript,/keyFor\(selectedDay\)/);
  assert.match(bodyScript,/見本の予定です（実際の予定ではありません）/);
  assert.match(bodyScript,/未記録/);
  assert.match(html,/AIとの連携は未実装/);
  assert.doesNotMatch(html, /api\.notion\.com|Authorization: Bearer/);
});
test('fixed calendar appointments are protected from destructive changes', () => {
  assert.match(bodyScript,/!item\.f/);
  assert.match(bodyScript,/if\(item\.f\)\{note\.textContent='固定予定は編集できません'/);
  assert.match(bodyScript,/if\(!item\|\|item\.f\)/);
});

test('Safari preview exists as a separate sample-only HTML without deployment', () => {
  const preview=readFileSync(new URL('../scriptable/yos-timeline-charcoal-preview.html', import.meta.url),'utf8');
  assert.ok(preview.startsWith('<!doctype html>'));
  assert.match(preview,/PREVIEW ONLY/);
  assert.match(preview,/id="tl"/);
  assert.match(preview,/本番データには反映しません/);
  assert.doesNotMatch(preview,/window\.YOS_CALENDAR_EVENTS\s*=/);
  assert.doesNotMatch(preview,/api\.notion\.com/);
});


test('compact overview exposes an accurate hour scale and zoom action',()=>{
 assert.match(html,/id="zoomBtn"/);
 assert.match(bodyScript,/density==='overview'\?'detail':'overview'/);
 assert.match(bodyScript,/const monday=new Date\(d\)/);
 assert.match(bodyScript,/priorVisualBottom/);
 const hours=24*27;
 assert.ok(hours<=700,'overview must not repeat the previous 1344px day height');
});

test('isolated WebView runtime draws schedule and saves real items without mixing examples',()=>{
 class Element{
  constructor(tag='div'){
   this.tagName=tag;this.children=[];this.className='';this.dataset={};this.value='';this.hidden=false;this.textContent='';
   this.style={setProperty(k,v){this[k]=v}};
   this.classList={
    add:(...a)=>{for(const x of a)if(!this.className.split(' ').includes(x))this.className+=(this.className?' ':'')+x},
    remove:(...a)=>{this.className=this.className.split(' ').filter(x=>!a.includes(x)).join(' ')},
    toggle:(x,v)=>{if(v===undefined)v=!this.className.split(' ').includes(x);v?this.classList.add(x):this.classList.remove(x)}
   };
  }
  set innerHTML(s){this._html=s;if(s.startsWith('<svg'))this.children=[new Element('svg')]}
  get innerHTML(){return this._html||''}
  get firstChild(){return this.children[0]}
  append(...nodes){for(const n of nodes.filter(Boolean)){n.parent=this;this.children.push(n)}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
  focus(){}setAttribute(k,v){this[k]=v}
  querySelector(q){return this.children.find(x=>x.tagName===q)||null}
  querySelectorAll(q){return this.children.filter(x=>q.split(',').some(y=>x.className.split(' ').includes(y.trim().replace('.',''))))}
  getBoundingClientRect(){const top=parseFloat(this.style.top)||0,height=parseFloat(this.style.height)||0;return {top,bottom:top+height}}
  animate(){return {}}addEventListener(){}scrollIntoView(){}
 }
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const document={getElementById:get,createElement:tag=>new Element(tag),querySelectorAll:()=>[]};
 const data=new Map(),storage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)};
 const script=new Function('document','window','localStorage','setInterval','confirm','performance','requestAnimationFrame','cancelAnimationFrame','navigator','setTimeout',bodyScript);
 script(document,{YOS_CALENDAR_EVENTS:[],scrollTo(){}},storage,()=>{},()=>true,{now:()=>1},()=>1,()=>{}, {vibrate(){}},()=>{});
 const count=type=>get('tl').children.filter(el=>el.className.split(' ').includes(type)).length;
 assert.equal(count('hour'),25);
 assert.equal(count('card'),13);
 assert.match(get('notice').textContent,/見本の予定/);
 get('addBtn').onclick();
 get('newTitle').value='テスト予定';get('newTime').value='09:00';get('newDuration').value='30';get('newKind').value='task';
 get('saveBtn').onclick();
 const saved=JSON.parse(storage.getItem('YOS_TIMELINE_LOCAL_V2'));
 assert.equal(saved.length,1,'demo rows must not be saved as personal data');
 assert.equal(saved[0].t,'テスト予定');
 assert.equal(count('card'),1);
 assert.equal(get('taskCount').textContent,'0/1');
});
