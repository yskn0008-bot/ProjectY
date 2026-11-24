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
 assert.match(src,/for\(const target of \["pictureMode","brightness","contrast"\]\)/);
 assert.match(src,/oninput="previewTVCompact\(event,'contrast'\)" onchange="commitTVCompact\(event,'contrast'\)"/);
});
test('four app slots visible and extra apps horizontally scrollable',()=>{
 assert.match(src,/grid-auto-columns:calc\(\(100% - 15px\)\/4\)/);
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

test('editable presets preserve legacy storage, mode-only and custom value semantics',async()=>{
 const code=src.slice(src.indexOf('const PICTURE_TARGETS='),src.indexOf('const QUICK_APP_MATCHERS='));
 const settings={pictureMode:{target:'pictureMode',currentValue:'standard',candidate:[{value:'standard'},{value:'cinema'},{value:'custom'}]},brightness:{target:'brightness',currentValue:'30',candidate:[{min:0,max:50,step:1}]}};
 const keys=new Map(),writes=[];
 class Request{async loadString(){
  const q=JSON.parse(this.body);
  if(q.method==='getPictureQualitySettings'){const list=Object.values(settings).filter(x=>!q.params[0].target||x.target===q.params[0].target);if(q.version==='1.1')list.push({target:'futureGamma',currentValue:'1',candidate:[{value:'1'}]});return JSON.stringify({result:[list]});}
  if(q.method==='setPictureQualitySettings'){const item=q.params[0].settings[0];writes.push(item);settings[item.target].currentValue=item.value;if(item.target==='pictureMode')settings.brightness.currentValue='5';return JSON.stringify({result:[]});}
  throw Error('unexpected RPC');
 }}
 const api=new Function('Request','sonyHost','sonyPSK','Keychain',code+'return{pictureProbe,pictureLoad,editPicturePreset,pictureAction};')(Request,()=> 'example',()=> 'mock',{contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v)});
 const prefix='yos.bravia.scriptable.picture-user-preset.v2.';
 keys.set(prefix+'day',JSON.stringify({schema:2,settings:[{target:'brightness',value:'30'}]}));
 assert.equal((await api.pictureProbe()).presets.day.settings[0].value,'30');
 await api.editPicturePreset({key:'day',name:'昼シネマ',settings:[{target:'pictureMode',value:'cinema'}]});
 assert.equal(writes.length,0);
 assert.equal(JSON.parse(keys.get(prefix+'day.previous')).settings[0].value,'30');
 await api.pictureLoad('day');assert.deepEqual(writes,[{target:'pictureMode',value:'cinema'}]);
 await api.editPicturePreset({key:'extra1',name:'独自',settings:[{target:'pictureMode',value:'custom'},{target:'brightness',value:'30'}]});
 await api.pictureLoad('extra1');assert.equal(settings.brightness.currentValue,'30');assert.equal(settings.pictureMode.currentValue,'custom');
 const before=keys.get(prefix+'extra1');
 await assert.rejects(api.editPicturePreset({key:'extra1',name:'invalid',settings:[{target:'brightness',value:'999'}]}),/許可/);
 assert.equal(keys.get(prefix+'extra1'),before);
 const count=writes.length;assert.match((await api.pictureAction('discover','')).message,/futureGamma/);assert.equal(writes.length,count);
});

test('discovery button shows immediate feedback and reports a result without altering saved controls',()=>{
 const begin=src.indexOf('let discoveryPending=false'),end=src.indexOf('function pictureEntry(',begin);
 const els={discoverPictureButton:{},discoverPictureStatus:{}},calls=[],timers=[];
 const api=new Function('document','nativeAction','setTimeout','clearTimeout',src.slice(begin,end)+'return{startPictureDiscovery,finishPictureDiscovery};')({getElementById:id=>els[id]},(...args)=>calls.push(args),fn=>{timers.push(fn);return 1},()=>{});
 api.startPictureDiscovery();api.startPictureDiscovery();
 assert.equal(calls.length,1);assert.equal(els.discoverPictureButton.disabled,true);assert.equal(els.discoverPictureStatus.hidden,false);
 api.finishPictureDiscovery('API拒否（12）');assert.equal(els.discoverPictureButton.disabled,false);assert.equal(els.discoverPictureStatus.textContent,'API拒否（12）');
 api.startPictureDiscovery();timers.at(-1)();assert.equal(els.discoverPictureButton.disabled,false);assert.match(els.discoverPictureStatus.textContent,/応答未確認/);
});
test('extra discovery uses only two bounded reads, exact v1.1 request and distinguishes API rejection',async()=>{
 const code=src.slice(src.indexOf('const PICTURE_TARGETS='),src.indexOf('const QUICK_APP_MATCHERS='));
 const calls=[];
 class Request{async loadString(){const q=JSON.parse(this.body);calls.push({q,timeout:this.timeoutInterval});return q.version==='1.0'?JSON.stringify({result:[[{target:'brightness',currentValue:'30'}]]}):JSON.stringify({error:[12,'unsupported']});}}
 const api=new Function('Request','sonyHost','sonyPSK','Keychain',code+'return{discoverExtraPictureTargets};')(Request,()=> 'example',()=> 'mock',{});
 const result=await api.discoverExtraPictureTargets();
 assert.equal(calls.length,2);assert.ok(calls.every(x=>x.q.method==='getPictureQualitySettings'&&x.timeout===5));
 assert.deepEqual(calls[1].q.params,[{}]);assert.equal(result.discovery,true);assert.match(result.message,/API拒否（12）/);assert.equal(result.entries,undefined);
});
