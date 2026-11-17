import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Web.js',import.meta.url),'utf8');
const marker='const HTML=';
const html=JSON.parse(source.split(marker)[1].split(';\nconst POLL=')[0]);
const webJS=html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1]||'';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

test('Scriptable native source and embedded WebView JS parse',()=>{
 assert.match(source,/^\/\/ Variables used by Scriptable\./);
 assert.match(source,/^\/\/ YOS_SCRIPT_NAME: YOS Remote Web$/m);
 assert.doesNotThrow(()=>new AsyncFunction(source));
 assert.doesNotThrow(()=>new AsyncFunction(webJS));
 assert.match(html,/<meta name="viewport"/);
});
test('every visible remote command has an authorized native mapping',async()=>{
 const prefix=source.slice(0,source.indexOf(marker));
 const mock={contains:()=>false,get:()=>''};
 const {checkCommand,rgbToHsv,floorInfo}=await new AsyncFunction('Keychain','Data','Request','WebView','Script','config','args',prefix+'\nreturn {checkCommand,rgbToHsv,floorInfo};')(mock,{},{},{},{},{},{});
 const commands=[...html.matchAll(/data-command="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(commands.length>=25);
 for(const entry of commands){const [device,action]=entry.split(':');assert.doesNotThrow(()=>checkCommand({device,action}));}
 const scenes=[...html.matchAll(/data-scene="([^"]+)"/g)].map(m=>m[1]);assert.ok(scenes.length>=4);
 for(const action of scenes)assert.doesNotThrow(()=>checkCommand({device:'scene',action}));
 for(const action of ['reset','delete','__proto__','hack'])assert.throws(()=>checkCommand({device:'tv',action}),/未対応/);
 for(const value of [0,101,50.5,Infinity,-10])assert.throws(()=>checkCommand({device:'floor',action:'brightness',value}),/明るさ/);
 assert.throws(()=>checkCommand({device:'floor',action:'color',value:'javascript:alert(1)'}),/色/);
 assert.deepEqual(rgbToHsv('#ff0000'),{hue:0,saturation:100});
 assert.equal(floorInfo({data:{device_on:true}}).device_on,true);
});
test('WebView command queue uses local native result channel, not navigations',()=>{
 assert.match(html,/window\.__YOSRemoteQueue=bridgeQueue/);
 assert.match(html,/window\.__YOSRemoteReply/);
 assert.match(html,/操作できません/);
 assert.match(html,/実機接続未確認/);
 const send=html.slice(html.indexOf('function send('),html.indexOf('function colorFromHue'));
 assert.doesNotMatch(send,/scriptable:\/\/|shortcuts:\/\/|window\.location/);
 assert.match(source,/web\.present\(true\)/);
 assert.match(source,/web\.evaluateJavaScript\(POLL,true\)/);
 assert.match(source,/Date\.now\(\)-start>2200/);
 assert.doesNotMatch(source,/Keychain\.set\(|FileManager\./);
});
test('native WebView opens without network commands or writing device config',async()=>{
 const calls=[];
 class WebView{
   async loadHTML(html,base){calls.push(['load',html.length,base]);}
   present(full){calls.push(['present',full]);return Promise.resolve();}
   async evaluateJavaScript(){calls.push(['eval']);return 'null';}
 }
 const Script={complete(){calls.push(['done']);},setShortcutOutput(){}};
 await new AsyncFunction('WebView','Script','config','args','Keychain','Data','Request',source)(WebView,Script,{runsInApp:true,runsInWidget:false},{queryParameters:{},shortcutParameter:''},{contains:()=>false,get:()=>''},{},class Request{constructor(){throw Error('Unexpected network call')}})
 assert.equal(calls[0][0],'load');
 assert.equal(calls[1][0],'present');
 assert.ok(calls.some(x=>x[0]==='done'));
 assert.ok(!calls.some(x=>x[0]==='eval'));
});
test('malformed action is rejected before any network or appliance request',async()=>{
 const events=[],scriptMessages=[];
 class WebView{
  async loadHTML(){}
  present(){return new Promise(resolve=>setImmediate(resolve));}
  async evaluateJavaScript(js,wait){
   if(wait){if(!this.given){this.given=true;return JSON.stringify({id:1,device:'tv',action:'formatDisk'})}await new Promise(resolve=>setImmediate(resolve));return 'null';}
   events.push(js);return null;
  }
 }
 const Script={complete(){},setShortcutOutput:x=>scriptMessages.push(x)};
 await new AsyncFunction('WebView','Script','config','args','Keychain','Data','Request',source)(WebView,Script,{runsInApp:true,runsInWidget:false},{queryParameters:{},shortcutParameter:''},{contains:()=>false,get:()=>''},{},class Request{constructor(){throw Error('Unexpected network call')}})
 assert.ok(events.some(s=>s.includes('ok\\":false')||s.includes('ok":false')),'Expected failure reply to WebView');
});
