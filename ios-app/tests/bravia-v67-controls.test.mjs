import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const prev=fs.readFileSync(new URL('../scriptable/remote-widgets/picture-v66/YOS Remote Hub.js',import.meta.url),'utf8');
const src=fs.readFileSync(new URL('../scriptable/remote-widgets/quick-media/YOS Remote Hub Quick TEST.js',import.meta.url),'utf8');
const begin=src.indexOf('const yosTVApps=[];'),end=src.indexOf('async function discoverSony(){',begin);
assert.ok(begin>0&&end>begin,'isolated appControl adapter is present');
const media=src.slice(begin,end);
const oldUI=prev.slice(prev.indexOf('const TV_ACTIONS ='),prev.indexOf('const LIGHT_BUTTONS ='));
const newUI=src.slice(src.indexOf('const TV_ACTIONS ='),src.indexOf('const LIGHT_BUTTONS ='));
test('original four device names and 12 TV keys are preserved',()=>{
 assert.equal(newUI,oldUI);
 assert.match(src,/data-panel="floor"/);
 assert.match(src,/data-panel="ac"/);
 assert.match(src,/data-panel="light"/);
 assert.match(src,/const LAYOUT_KEY="yos.remote.tv.buttons.v52"/);
 assert.match(src,/function installCenterGesture/);
 assert.match(src,/tvHoldHeartbeat/);
 assert.match(src,/lightHoldHeartbeat/);
});
test('picture control renders TV-advertised range and inline contrast bar',()=>{
 assert.match(src,/id="tvBrightness" type="range"/);
 assert.match(src,/id="tvContrast" type="range"/);
 assert.match(src,/renderTVStudio\(\)/);
 assert.match(src,/const remaining=PICTURE_TARGETS\.filter/);
 assert.match(src,/oninput="previewTVCompact\(event,'contrast'\)" onchange="commitTVCompact\(event,'contrast'\)"/);
});
test('three app slots visible and extra apps horizontally scrollable',()=>{
 assert.match(src,/grid-auto-columns:calc\(\(100% - 10px\)\/3\)/);
 assert.match(src,/overflow-x:auto/);
 assert.match(src,/aria-label="BRAVIAアプリを横スクロール"/);
});
function harness(lists,opts={}){
 const calls=[],host='192.0.2.31';
 class Request {
  constructor(url){this.url=url;this.response={statusCode:200};}
  async loadString(){
   assert.equal(this.url,'http://'+host+'/sony/appControl');
   assert.equal(this.headers['X-Auth-PSK'],'test-psk');
   const request=JSON.parse(this.body);calls.push(request);
   if(request.method==='getApplicationList')return JSON.stringify({result:[lists]});
   if(request.method==='setActiveApp')return JSON.stringify({result:[]});
   if(request.method==='getApplicationStatusList')return JSON.stringify({result:[[{name:'textInput',status:opts.keyboard?'on':'off'}]]});
   if(request.method==='setTextForm')return JSON.stringify({result:[0]});
   return JSON.stringify({error:[404,'not found']});
  }
 }
 const api=new Function('Request','sonyHost','sonyPSK',media+'return {yosTVGetApps,yosTVMediaAction,yosTVAppJSON,yosTVApps};')(
  Request,()=>host,()=>'test-psk'
 );
 return {api,calls};
}
const apps=[
 {title:'Netflix',uri:'com.sony.dtv.com.netflix.ninja.MainActivity'},
 {title:'YouTube',uri:'com.sony.dtv.com.google.android.youtube.tv.MainActivity'},
 {title:'ExpressVPN',uri:'com.sony.dtv.com.expressvpn.android.tv.MainActivity'}
];
test('launch only an app URI returned by the actual TV',async()=>{
 const {api,calls}=harness(apps);
 const got=await api.yosTVMediaAction('list');
 assert.equal(got.apps.length,3);
 await api.yosTVMediaAction('launch','1');
 assert.deepEqual(calls.filter(x=>x.method==='setActiveApp').map(x=>x.params[0].uri),[apps[1].uri]);
 await assert.rejects(api.yosTVMediaAction('launch','404'),/不正/);
});
test('VPN button opens installed app and never pretends to toggle connection',async()=>{
 const {api,calls}=harness(apps);
 const result=await api.yosTVMediaAction('vpnOpen');
 assert.match(result.tvExtra,/接続\/切断はアプリ内/);
 assert.equal(calls.filter(x=>x.method==='setActiveApp')[0].params[0].uri,apps[2].uri);
 assert.doesNotMatch(media,/setAlwaysOnVpn|VpnService|vpnDisconnect|vpnConnect|setVPNState/);
 const none=harness(apps.slice(0,2));
 await assert.rejects(none.api.yosTVMediaAction('vpnOpen'),/VPNアプリが見つかりません/);
});
test('text only sends while on-screen TV keyboard is active',async()=>{
 const fail=harness(apps,{keyboard:false});
 await assert.rejects(fail.api.yosTVMediaAction('text','沖縄'),/検索欄を開いて/);
 assert.equal(fail.calls.some(x=>x.method==='setTextForm'),false);
 const ok=harness(apps,{keyboard:true});
 const result=await ok.api.yosTVMediaAction('text','沖縄');
 assert.match(result.tvExtra,/入力要求/);
 assert.deepEqual(ok.calls.find(x=>x.method==='setTextForm').params,['沖縄']);
 await assert.rejects(ok.api.yosTVMediaAction('text','a'.repeat(141)),/入力文字/);
});
test('secrets stay out of UI and startup never changes picture or VPN',()=>{
 const first=src.indexOf('<script>');
 const last=src.indexOf('</script></body></html>');
 const html=src.slice(first,last);
 assert.doesNotMatch(html,/sonyPSK\(|Keychain\.get\(/);
 assert.match(src,/nativeAction\("tvApps","list","アプリ一覧"\)/);
 assert.match(src,/if\(activePanel==="tv"\)probePictureScene\(\)/);
 assert.doesNotMatch(media,/YOS_NOTION_INTEGRATION_TOKEN|ftp:|api\.github\.com/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(src));
});

test('actual cooked WebView HTML parses after HTML tokenizer normalization and has independent panels',()=>{
 const end=src.indexOf('</script></body></html>`')+'</script></body></html>`'.length;
 const html=new Function(src.slice(0,end)+'\nreturn html;')();
 assert.ok(!html.includes('\u0000'),'no raw NUL in emitted HTML');
 const js=html.split('<script>')[1].split('</script>')[0].replace(/\u0000/g,'\ufffd');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.equal((html.match(/<section\b/g)||[]).length,(html.match(/<\/section>/g)||[]).length);
 assert.equal((html.match(/<div\b/g)||[]).length,(html.match(/<\/div>/g)||[]).length);
 assert.match(html,/<\/div><\/section>\s*<section class="card remote-panel" data-panel="light">/);
 const regex=js.match(/\|\|\/(\[[^\]]+\])\/\.test\(value\)/);
 assert.ok(regex);
 const control=new RegExp(regex[1]);
 assert.equal(control.test('沖縄'),false);
 assert.equal(control.test('a\u0000b'),true);
 assert.equal(control.test('a\n'),true);
});


test('isolated remote test target is pinned and does not replace the existing remote or recovery targets',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 const target=catalog.targets.find(x=>x.id==='remote-hub-quick-test');
 assert.equal(target.name,'YOS Remote Hub Quick TEST');
 assert.equal(target.path,'ios-app/scriptable/remote-widgets/quick-media/YOS Remote Hub Quick TEST.js');
 assert.match(target.commit,/^[a-f0-9]{40}$/);
 assert.equal(target.sha256,createHash('sha256').update(src).digest('hex'));
 assert.equal(catalog.targets.find(x=>x.id==='remote-hub').name,'リモコン');
 assert.ok(catalog.targets.some(x=>x.id==='bravia-picture-off-repair'));
 assert.ok(catalog.targets.some(x=>x.id==='common-installer-repair'));
 assert.equal(new Set(catalog.targets.map(x=>x.id)).size,catalog.targets.length);
 assert.equal(new Set(catalog.targets.map(x=>x.name)).size,catalog.targets.length);
});


test('quick remote includes the required legacy and current Scriptable installer source header',()=>{
 assert.ok(src.startsWith('// Variables used by Scriptable.\n'));
 assert.match(src.split('\n').slice(0,20).join('\n'),/^\/\/ YOS_SCRIPT_NAME: YOS Remote Hub Quick TEST$/m);
});

test('picture fallback queries all allowlisted targets and distinguishes missing from errors',async()=>{
 const picture=src.slice(src.indexOf('const PICTURE_TARGETS='),src.indexOf('const QUICK_APP_MATCHERS=')).replace(/async function sonyVideoJSON\([\s\S]*?(?=function flattenPicture)/,'');
 const calls=[];
 const values={brightness:{target:'brightness',currentValue:'50',candidate:[{min:'0',max:'100',step:'1'}]},contrast:{target:'contrast',isAvailable:false}};
 const rpc=async(method,params)=>{calls.push({method,params});if(method==='setPictureQualitySettings'){const p=params[0].settings[0];values[p.target].currentValue=p.value;return{result:[]};}const target=params[0].target;if(!target||target==='color')throw Error('timeout');return{result:values[target]?[values[target]]:[]};};
 const api=new Function('sonyVideoJSON','Keychain',picture+'return {pictureProbe,writePicture};')(rpc,{contains:()=>false});
 const probe=await api.pictureProbe();
 assert.equal(probe.entries.length,12);assert.equal(calls.length,13);
 assert.equal(probe.entries.find(x=>x.target==='contrast').state,'unavailable');
 assert.equal(probe.entries.find(x=>x.target==='color').state,'failed');
 assert.equal(probe.entries.find(x=>x.target==='sharpness').state,'missing');
 assert.equal(probe.entries.find(x=>x.target==='brightness').available,true);
 calls.length=0;await api.writePicture('brightness','55');
 assert.deepEqual(calls.map(x=>x.method),['getPictureQualitySettings','setPictureQualitySettings','getPictureQualitySettings']);
 calls.length=0;await assert.rejects(api.writePicture('brightness','101'),/許可/);
 assert.ok(!calls.some(x=>x.method==='setPictureQualitySettings'));
});
test('TV shortcut validates input before sending and reads back actual power',async()=>{
 const code=src.slice(src.indexOf('async function tvShortcutPower('),src.indexOf('const queue=[];'));
 let state='standby';const calls=[];
 const rpc=async(service,method,params)=>{calls.push(method);if(method==='setPowerStatus'){state=params[0].status?'active':'standby';return{result:[]}}return{result:[{status:state}]}};
 const api=new Function('sonyQuickJSON',code+'return {parseTVShortcut,executeTVShortcut};')(rpc);
 assert.equal(await api.executeTVShortcut('tv toggle'),'テレビ ON 確認');
 assert.deepEqual(calls,['getPowerStatus','setPowerStatus','getPowerStatus']);
 state='unknown';calls.length=0;
 await assert.rejects(api.executeTVShortcut('tv toggle'),/状態不明/);assert.deepEqual(calls,['getPowerStatus']);
 for(const bad of ['tv delete','tv on extra','light','tv brightness 5.5',{}])assert.throws(()=>api.parseTVShortcut(bad));
});

test('picture read lane leaves commands responsive and rejects stale results',async()=>{
 const lane=src.slice(src.indexOf('const queue=[];'),src.indexOf('async function processQueue()'));
 let resolveFirst,reads=0,mutations=0;
 const received=[];
 const api=new Function('pictureProbe','quickProbe','processMutation','receive',lane+`
 async function processQueue(){if(running)return;running=true;while(queue.length){activeQueueItem=queue.shift();await processMutation(activeQueueItem);activeQueueItem=null;}running=false;runProbeLane();}
 web={evaluateJavaScript:async code=>receive(code)};return{enqueueRemote};
 `)(async()=>{reads++;if(reads===1)return new Promise(r=>{resolveFirst=r});return{entries:[{value:'new'}]}},async()=>({}),async()=>{mutations++},v=>received.push(v));
 api.enqueueRemote({device:'picture',action:'probe'});api.enqueueRemote({device:'picture',action:'probe'});
 api.enqueueRemote({device:'tv',action:'home'});
 await Promise.resolve();await Promise.resolve();
 assert.equal(mutations,1);assert.equal(reads,1);
 resolveFirst({entries:[{value:'stale'}]});
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(reads,2);assert.ok(received.some(x=>x.includes('new')));assert.ok(!received.some(x=>x.includes('stale')));
});

test('launcher never interprets incoming Shortcuts objects or commands as a write',()=>{
 const start=src.indexOf('const REMOTE_LAUNCHER_ONLY=false;'),end=src.indexOf('async function executeTVShortcut(',start);
 assert.ok(start>0&&end>start);
 const api=new Function(src.slice(start,end)+'return {resolveRemoteInput,parseTVShortcut};')();
 for(const raw of [undefined,null,'',' ',{},[],{unexpected:'value'},123,'tv off']){
  assert.equal(api.resolveRemoteInput({shortcutParameter:raw},true),'');
 }
 for(const raw of [undefined,null,'',' ',{},[]])assert.equal(api.resolveRemoteInput({shortcutParameter:raw}),'');
 assert.equal(api.resolveRemoteInput({shortcutParameter:' tv off '}),'tv off');
 assert.equal(api.resolveRemoteInput({queryParameters:{action:'tv home'}}),'tv home');
 for(const raw of [123,{action:'tv off'},['tv off']])assert.throws(()=>api.resolveRemoteInput({shortcutParameter:raw}),/文字列/);
 const embedded=src.slice(start,end).replace('const REMOTE_LAUNCHER_ONLY=false;','const REMOTE_LAUNCHER_ONLY=true;');
 const launch=new Function(embedded+'return resolveRemoteInput;')();
 assert.equal(launch({shortcutParameter:'tv off'}),'');
 assert.equal(launch({shortcutParameter:{text:'tv off'}}),'');
});
