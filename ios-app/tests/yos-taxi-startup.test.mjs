import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const src=fs.readFileSync(new URL('../scriptable/YOS TAXI.js',import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const entry=catalog.additional_targets.find(t=>t.id==='yos-taxi');
test('TAXI distribution is pinned to exactly the shipped code',()=>{
 assert.equal(crypto.createHash('sha256').update(src).digest('hex'),entry.sha256);
 assert.doesNotMatch(src,/43050|21950|14750|const SEED|(?:secret_|ntn_|sk-proj-)[A-Za-z0-9_-]{16,}/);
});
function htmlUI(html){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',addEventListener(){}});return nodes.get(id)};
 const document={getElementById:get,addEventListener(){}},window={addEventListener(){}};
 for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInNewContext(m[1],{window,document,setInterval(){}});
 return {window,get};
}
async function run({ready=true,denied=true}={}){
 const events=[],alerts=[],files=new Map();let close;
 const closed=new Promise(resolve=>{close=resolve});let n=0;
 const fm={libraryDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),readString:p=>files.get(p),writeString:(p,v)=>files.set(p,v),remove:p=>files.delete(p),move:(a,b)=>{files.set(b,files.get(a));files.delete(a)},copy:(a,b)=>files.set(b,files.get(a))};
 class WebView{
  async loadHTML(html,base){events.push('load');assert.equal(base,'https://yos-taxi.invalid/');assert.match(html,/YOS TAXI を起動中/);assert.match(html,/<\/head><body>/);const {window,get}=htmlUI(html);assert.equal(window.yosReady,true);assert.match(get('screen').innerHTML,/営業状態/);assert.match(get('nav').innerHTML,/分析/);this.window=window;}
  async evaluateJavaScript(js,callback){assert.equal(callback,false);if(js.startsWith('Boolean(')){events.push('ready');return ready}if(js.startsWith('window.yosSnapshot')){events.push('snapshot');assert.match(js,/未同期/);return null}if(js.startsWith('JSON.stringify(window.yosTake')){events.push('poll');return JSON.stringify(this.window.yosTake())}throw Error('unexpected eval')}
  present(fullscreen){assert.equal(fullscreen,false);events.push('present');return closed}
 }
 class Request{constructor(){events.push('request');this.response={statusCode:403}}async loadJSON(){return {}}}
 class Alert{addAction(){}async presentAlert(){alerts.push(this.title)}}
 const ctx={WebView,Request,Alert,FileManager:{local:()=>fm},Keychain:{contains:()=>!denied,get:()=> 'test-only'},Timer:{schedule:(s,repeat,fn)=>{queueMicrotask(()=>{n++;if(n>=3)close();fn()})}},Script:{complete:()=>events.push('complete')}};
 await new vm.Script('(async()=>{\n'+src+'\n})()').runInNewContext(ctx,{timeout:5000});
 return {events,alerts,files};
}
test('empty data renders five tabs before networking; missing credential does not block startup',async()=>{
 const r=await run();
 assert.deepEqual(r.events.slice(0,3),['load','ready','present']);
 assert.ok(r.events.includes('snapshot'));assert.ok(r.events.includes('poll'));assert.equal(r.events.at(-1),'complete');
 assert.equal(r.alerts.length,0);assert.equal(r.files.size,0);
});
test('Notion 403 does not suppress already rendered screen',async()=>{
 const r=await run({denied:false});
 assert.ok(r.events.indexOf('present')<r.events.indexOf('request'));
 assert.ok(r.events.includes('snapshot'));assert.equal(r.alerts.length,0);assert.equal(r.files.size,0);
});
test('unconfirmed initial render stops with native diagnostic, without data requests or writes',async()=>{
 const r=await run({ready:false,denied:false});
 assert.deepEqual(r.events,['load','ready','complete']);
 assert.deepEqual(r.alerts,['YOS TAXI｜起動・接続エラー']);assert.equal(r.files.size,0);
});
