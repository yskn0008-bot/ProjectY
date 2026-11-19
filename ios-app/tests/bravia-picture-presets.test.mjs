import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Hub.js',import.meta.url),'utf8');
const begin=source.indexOf('const PICTURE_TARGETS=');
const end=source.indexOf('async function discoverSony(){',begin);
assert.ok(begin>0&&end>begin);

function makeHarness({unsupported=false,writeFails=false,mode='standard',brightness=70}={}){
 const settings={
  pictureMode:{currentValue:mode,candidate:[{value:'standard'},{value:'Cinema home'},{value:'Custom'}]},
  brightness:{currentValue:String(brightness),candidate:[{min:0,max:50,step:1}]},
  contrast:{currentValue:'90',candidate:[{min:0,max:100,step:1}]},
  color:{currentValue:'50',candidate:[{min:0,max:100,step:1}]}
 };
 const writes=[],reads=[],keys=new Map();
 const Keychain={contains:key=>keys.has(key),get:key=>keys.get(key),set:(key,val)=>keys.set(key,val),remove:key=>keys.delete(key)};
 class Request{
  constructor(url){this.url=url;this.response={statusCode:200};}
  async loadString(){
   assert.equal(this.url,'http://television/sony/video');
   assert.equal(this.headers['X-Auth-PSK'],'private-on-device');
   const request=JSON.parse(this.body);
   if(unsupported)return JSON.stringify({error:[404,'Unknown method']});
   if(request.method==='getPictureQualitySettings'){
    const target=request.params[0].target;
    reads.push(target);
    const entries=Object.entries(settings).filter(([name])=>target===''||target===name).map(([name,item])=>({target:name,isAvailable:true,...item}));
    return JSON.stringify({result:[entries]});
   }
   if(request.method==='setPictureQualitySettings'){
    assert.equal(request.params[0].settings.length,1,'single atomic property write');
    const [entry]=request.params[0].settings;
    writes.push(entry);
    if(!writeFails&&settings[entry.target])settings[entry.target].currentValue=entry.value;
    return JSON.stringify({result:[]});
   }
   throw Error('Unexpected API call');
  }
 }
 const load=new Function('Request','sonyHost','sonyPSK','Keychain','return (async()=>{'+source.slice(begin,end)+'\nreturn{pictureProbe,pictureSave,pictureLoad,pictureAction,writePicture,pictureAll};})()');
 const api=load(Request,()=> 'television',()=> 'private-on-device',Keychain);
 return{api,settings,writes,reads,keys};
}

test('existing remote, adaptive keys, and persisted layout remain',()=>{
 assert.match(source,/YOS Remote Hub v6\.5/);
 assert.match(source,/function installCenterGesture/);
 assert.match(source,/const LAYOUT_KEY="yos\.remote\.tv\.buttons\.v52"/);
 assert.match(source,/const LIGHT_HOLD_BURST=2/);
 assert.match(source,/pictureOff:\["pictureoff","picoff"\]/);
 assert.match(source,/sendTVShortcut\(event,'pictureOff','消画'\)/);
 assert.match(source,/openShortcuts\(event\)/);
 assert.match(source,/openBrightnessBar\(event\)/);
 assert.match(source,/class="pic-big-bar"/);
 assert.match(source,/oninput="previewBrightness\(event\)" onchange="commitBrightness\(event\)"/);
 assert.match(source,/PICTURE_MENU=\[/);
 assert.match(source,/\["色詳細設定",/);
 assert.match(source,/テレビで設定/);
 assert.doesNotMatch(source,/picture-night-backup\.v1|level=min\+Math\.round/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(source));
});

test('embedded HTML script compiles and presents supported controls',()=>{
 const html=new Function(source.slice(0,source.indexOf('\nfunction secure(key)'))+'\nreturn html;')();
 const js=html.split('<script>')[1]?.split('</script>')[0];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js));
 for(const section of ['基本設定','明るさ','色','くっきりすっきり','動き','映像信号','色詳細設定'])assert.ok(js.includes(section),section);
 for(const label of ['ショートカット','明るさバー','消画'])assert.ok(html.includes(label),label);
});

test('opening or probing settings never modifies the BRAVIA',async()=>{
 const h=makeHarness();
 const probe=await (await h.api).pictureProbe();
 assert.equal(probe.entries.length,4);
 assert.equal(probe.entries.find(x=>x.target==='brightness').max,50);
 assert.equal(h.writes.length,0);
 assert.deepEqual(h.reads,['']);
 assert.deepEqual(probe.saved,{day:false,night:false,movie:false});
});

test('brightness is user-selected, sent once on commit, and read back',async()=>{
 const h=makeHarness({brightness:27});
 const api=await h.api;
 await api.pictureAction('set',JSON.stringify({target:'brightness',value:'18'}));
 assert.deepEqual(h.writes,[{target:'brightness',value:'18'}]);
 assert.equal(h.settings.brightness.currentValue,'18');
 assert.equal(h.keys.size,0);
});

test('invalid or non-step numeric settings cannot be sent',async()=>{
 const h=makeHarness();
 const api=await h.api;
 for(const value of ['-2','51','3.5','not-a-number']){
  await assert.rejects(api.pictureAction('set',JSON.stringify({target:'brightness',value})),/許可していない/);
 }
 await assert.rejects(api.pictureAction('set',JSON.stringify({target:'gamma',value:'1'})),/非対応/);
 assert.equal(h.writes.length,0);
});

test('only television-advertised enum values may be selected',async()=>{
 const h=makeHarness();const api=await h.api;
 await api.pictureAction('set',JSON.stringify({target:'pictureMode',value:'Cinema home'}));
 assert.equal(h.settings.pictureMode.currentValue,'Cinema home');
 await assert.rejects(api.pictureAction('set',JSON.stringify({target:'pictureMode',value:'Dynamic'})),/許可していない/);
 assert.deepEqual(h.writes,[{target:'pictureMode',value:'Cinema home'}]);
});

test('three user-managed presets do not impose an automatic Night brightness',async()=>{
 const h=makeHarness({brightness:36});const api=await h.api;
 await api.pictureSave('night');
 assert.equal(h.settings.brightness.currentValue,'36');
 assert.equal(h.writes.length,0);
 assert.equal(h.keys.size,1);
 const key=[...h.keys.keys()][0];
 const saved=JSON.parse(h.keys.get(key));
 assert.equal(saved.settings.find(x=>x.target==='brightness').value,'36');
 assert.equal(saved.settings.length,4);
 const flags=(await api.pictureProbe()).saved;
 assert.equal(flags.night,true);
 assert.equal(flags.day,false);
});

test('saved picture presets recall the users exact configuration',async()=>{
 const h=makeHarness({brightness:38});const api=await h.api;
 await api.pictureSave('day');
 h.settings.brightness.currentValue='5';
 h.settings.color.currentValue='80';
 h.settings.contrast.currentValue='20';
 const result=await api.pictureLoad('day');
 assert.equal(h.settings.brightness.currentValue,'38');
 assert.equal(h.settings.color.currentValue,'50');
 assert.equal(h.settings.contrast.currentValue,'90');
 assert.match(result.message,/呼び出しました/);
 assert.equal(h.keys.size,1);
});

test('unsupported TV cannot alter picture settings or save empty presets',async()=>{
 const h=makeHarness({unsupported:true});const api=await h.api;
 await assert.rejects(api.pictureProbe(),/拒否/);
 await assert.rejects(api.pictureSave('movie'),/拒否/);
 await assert.rejects(api.pictureAction('set',JSON.stringify({target:'brightness',value:'18'})),/拒否/);
 assert.equal(h.writes.length,0);assert.equal(h.keys.size,0);
});

test('unverified TV write never reports success',async()=>{
 const h=makeHarness({writeFails:true});const api=await h.api;
 await assert.rejects(api.pictureAction('set',JSON.stringify({target:'brightness',value:'18'})),/反映確認できません/);
 assert.equal(h.settings.brightness.currentValue,'70');
});

test('unknown shortcut and invalid preset metadata are rejected before writes',async()=>{
 const h=makeHarness();const api=await h.api;
 await assert.rejects(api.pictureLoad('night'),/保存済み設定がありません/);
 await assert.rejects(api.pictureAction('noop',''),/不明/);
 h.keys.set('yos.bravia.scriptable.picture-user-preset.v2.day',JSON.stringify({schema:2,settings:[{target:'gamma',value:'2'}]}));
 await assert.rejects(api.pictureLoad('day'),/不明な保存データ/);
 assert.equal(h.writes.length,0);
});
