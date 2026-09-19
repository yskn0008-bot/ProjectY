import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function installCalendarAutoSync(){'),html.indexOf('\ninstallCalendarAutoSync();'));
function setup({search='',synced=true,ios=true}={}){
 let now=1000000,count=0;const events={},store={life:JSON.stringify({days:synced?{today:{lastSync:new Date(800000).toISOString()}}:{}})};
 const document={visibilityState:'visible',addEventListener:(n,f)=>events[n]=f};
 vm.runInNewContext(source+';installCalendarAutoSync()',{URLSearchParams,location:{search},navigator:{userAgent:ios?'iPhone':'desktop'},Date:{now:()=>now,parse:Date.parse},KEY:'life',localStorage:{getItem:k=>store[k]},window:{addEventListener:(n,f)=>events[n]=f},document,launchCalendarSync:()=>{count++;store['yos-life-calendar-launch-v1']=String(now)}});
 return{events,document,store,count:()=>count,advance:()=>{now+=61000}};
}
test('configured iPhone opens sync once, suppresses return, refreshes on later foreground',()=>{
 const s=setup();s.events.pageshow();assert.equal(s.count(),1);
 s.events.visibilitychange();s.events.pageshow();assert.equal(s.count(),1);
 s.advance();s.document.visibilityState='hidden';s.events.visibilitychange();assert.equal(s.count(),1);
 s.document.visibilityState='visible';s.events.visibilitychange();assert.equal(s.count(),2);
});
test('sync URL return does not reopen Scriptable; later open can sync',()=>{
 const s=setup({search:'?sync=payload'});s.events.pageshow();s.events.visibilitychange();assert.equal(s.count(),0);
 s.advance();s.events.visibilitychange();assert.equal(s.count(),1);
});
test('unconfigured and desktop users are not sent to Scriptable',()=>{
 for(const options of [{synced:false},{ios:false}]){const s=setup(options);s.events.pageshow?.();assert.equal(s.count(),0)}
});
test('another tab launch and malformed storage suppress automatic navigation',()=>{
 const s=setup();s.store['yos-life-calendar-launch-v1']='1000000';s.events.pageshow();assert.equal(s.count(),0);
 s.advance();s.store.life='invalid';s.events.visibilitychange();assert.equal(s.count(),0);
});
