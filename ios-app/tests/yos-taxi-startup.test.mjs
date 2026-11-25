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
 const listeners={};const document={getElementById:get,addEventListener(type,fn){(listeners[type]??=[]).push(fn)}},window={addEventListener(){}}; get('sheet').showModal=()=>{get('sheet').open=true};get('sheet').close=()=>{get('sheet').open=false};
 for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInNewContext(m[1],{window,document,setInterval(){}});
 return {window,get,click(dataset){for(const fn of listeners.click||[])fn({target:{closest:()=>({dataset})}})}};
}
async function run({ready=true,denied=true}={}){
 const events=[],alerts=[],files=new Map();let close;
 const closed=new Promise(resolve=>{close=resolve});let n=0;
 const fm={libraryDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),readString:p=>files.get(p),writeString:(p,v)=>files.set(p,v),remove:p=>files.delete(p),move:(a,b)=>{files.set(b,files.get(a));files.delete(a)},copy:(a,b)=>files.set(b,files.get(a))};
 class WebView{
  async loadHTML(html,base){events.push('load');assert.equal(base,'https://yos-taxi.invalid/');assert.match(html,/YOS TAXI を起動中/);assert.match(html,/<\/head><body>/);const {window,get}=htmlUI(html);assert.equal(window.yosReady,true);assert.match(get('screen').innerHTML,/給与見込み/);assert.doesNotMatch(get('screen').innerHTML,/営業状態/);assert.match(get('nav').innerHTML,/分析/);this.window=window;}
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

test('direct-source parsers reject stale and malformed information and distinguish reservations',()=>{
 const util=vm.runInNewContext(src.slice(src.indexOf('const sourceSpec='),src.indexOf('const planPath='))+';({parseJMA,parseNaha,csvRows,parseCruise,cruiseResource,feedSource})');
 const now=Date.parse('2026-11-25T08:00:00+09:00'),d=new Date(now-3600000).toISOString();
 const weather=[{publishingOffice:'沖縄気象台',reportDatetime:d,timeSeries:[{timeDefines:[d],areas:[{area:{code:'471010'},weathers:['雨']}]}]}];
 assert.equal(util.parseJMA(weather,now).status,'ok');
 assert.equal(util.parseJMA(weather,now+13*3600000).status,'stale');
 assert.throws(()=>util.parseJMA([],now));
 const rss='<rss><channel><item><title>道路通行止め</title><link>https://www.city.naha.okinawa.jp/a</link><pubDate>'+d+'</pubDate></item><item><title>交通委託業務</title><link>https://www.city.naha.okinawa.jp/b</link><pubDate>'+d+'</pubDate></item></channel></rss>';
 assert.equal(util.parseNaha(rss,now).items.length,1);
 assert.throws(()=>util.parseNaha('<html>error</html>',now));
 const csv='港湾,入港月日,入港時間,出港月日,出港時間,船名,係留施設名（バース）\n那覇港,2026-11-25,10:00,2026-11-25,18:00,"船,一",岸壁\n';
 assert.equal(util.parseCruise(csv,now-86400000,now).items[0].title,'船,一（那覇港・寄港予約）');
 assert.throws(()=>util.parseCruise('wrong,headers\nx,y',now,now));
 assert.equal(util.feedSource({schema:1,generatedAt:d,sources:[]},'naha_rss',now).status,'error');
 assert.equal(util.feedSource({schema:1,generatedAt:d,sources:[]},'naha_rss',now+3*3600000).status,'stale');
 assert.throws(()=>util.cruiseResource({success:true,result:{resources:[{name:'2026',format:'CSV',url:'https://example.invalid/file.csv',created:d}]}},now));
});
test('dashboard keeps sales analysis on separate pages and explicit calendar off/target controls',()=>{
 const html=JSON.parse(src.match(/^const UI=(.*);$/m)[1]);
 assert.match(html,/overflow:hidden/);
 assert.match(html,/data-act="pageNext"/);
 assert.match(html,/data-save-day/);
 assert.match(html,/day\.off/);
 assert.match(html,/day\.missed/);
 assert.match(html,/給与見込み/);
 assert.match(html,/根拠付きAI相談文をコピー/);
 assert.match(html,/未校正/);
});

test('official event listing is date scoped and is not proof of event occurrence',()=>{
 const util=vm.runInNewContext(src.slice(src.indexOf('const sourceSpec='),src.indexOf('const planPath='))+';({parseEventTable})');
 const now=Date.parse('2026-11-25T10:00:00+09:00');
 const html='<h1>2026年11月のイベント一覧</h1><table><tr><th>期日</th><th>催事名</th><th>会場</th><th>時間</th></tr><tr><td>26日(木)</td><td>試験催事</td><td>会議場</td><td>12:00</td></tr><tr><td>1日(日)</td><td>終了済み</td><td>会議場</td><td>10:00</td></tr></table>';
 const r=util.parseEventTable(html,2026,11,now);
 assert.equal(r.items.length,1);assert.equal(r.items[0].date,'2026-11-26');assert.match(r.items[0].kind,/未確認/);
 assert.throws(()=>util.parseEventTable(html,2026,12,now));
});
test('only observed cycles with complete time and sufficient samples are comparable',()=>{
 const html=JSON.parse(src.match(/^const UI=(.*);$/m)[1]);
 const core=JSON.parse(src.match(/^const CORE=(.*);$/m)[1]);
 const helper=html.slice(html.indexOf('function observedCycles('),html.indexOf('function observedText('));
 const fn=vm.runInNewContext(core+helper+';observedCycles');
 const now=Date.parse('2026-11-25T10:00:00+09:00'),sample={at:now-60000,area:'A',method:'GO',amount:1200,start:'09:00',end:'09:12',gap:8};
 assert.equal(fn(Array(7).fill(sample),now).length,0);
 assert.equal(fn(Array(8).fill(sample),now)[0].rate,3600);
 assert.equal(fn(Array(8).fill({...sample,gap:null}),now).length,0);
 assert.equal(fn(Array(8).fill({...sample,at:now-25*3600000}),now).length,0);
});
test('research button requests a new acquisition; sync details show error and never embed a credential',()=>{
 const html=JSON.parse(src.match(/^const UI=(.*);$/m)[1]).replace('__PAYLOAD__',JSON.stringify({month:'2026-11',today:'2026-11-25',at:'未取得',status:'未同期｜404 運行記録への接続なし',rows:[],field:null,native:true})).replace('__CORE__',()=>JSON.parse(src.match(/^const CORE=(.*);$/m)[1]));
 const {window,get,click}=htmlUI(html);
 click({act:'research'});assert.equal(get('sheetTitle').textContent,'営業リサーチ');assert.match(get('sheetBody').innerHTML,/確認中/);assert.equal(window.yosTake().actions[0].type,'research');
 window.yosResearch({at:Date.now(),sources:[{id:'jma',name:'気象庁',status:'error',summary:'取得失敗',items:[]}]});
 assert.match(get('sheetBody').innerHTML,/鮮度確認済 0\/1/);
 click({act:'syncInfo'});assert.match(get('sheetBody').innerHTML,/404/);
});
