import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Trial Launcher.js', import.meta.url),'utf8');
const hub = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Hub.js', import.meta.url),'utf8');
const core = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Tapo H110 Core.js', import.meta.url),'utf8');

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function fakeHarness({offline=false}={}) {
  const files=new Map();
  const writes=[];
  const requests=[];
  let completed=0;
  const fixtureHub = `// YOS Remote Hub v6.6
function bindTVSeekHold(){}
async function controlFloor(action,value){}
const CONFIG={tv:"YOS BRAVIA Remote",light:"YOS Light Widget",ac:"YOS AC Widget"};
if(CONFIG.tv!=="テレビリモコン"||CONFIG.light!=="照明ウィジェット"||CONFIG.ac!=="エアコンウィジェット")throw Error("name translation broken");
const tapo=importModule("YOS Tapo H110 Core");
if(typeof tapo.clientForHost!=="function")throw Error("missing preview core");
Script.complete();`;
  const fixtureCore = `// Shared Tapo H110 KLAP v2 core for Scriptable
function clientForHost(){}
module.exports={clientForHost};`;
  const fm={
    documentsDirectory(){return '/local';},
    joinPath(a,b){return a+'/'+b;},
    fileExists(path){return files.has(path);},
    readString(path){return files.get(path);},
    writeString(path,contents){if(path.endsWith('.js'))throw Error('would overwrite existing JS');files.set(path,contents);writes.push(path);},
    remove(path){files.delete(path);}
  };
  class Request {
    constructor(url){requests.push(url);this.url=url;this.response=null;}
    async loadString(){
      if(offline)throw Error('Network intentionally disabled');
      this.response={statusCode:200};
      return this.url.endsWith('YOS%20Remote%20Hub.js')?fixtureHub:fixtureCore;
    }
  }
  const Script={name(){return 'Untitled Script 90';},complete(){completed++;}};
  const FileManager={local(){return fm;},iCloud(){throw Error('Must not access iCloud manager inside trial launcher');}};
  const importModule=()=>{throw Error('Should use the in-memory Tapo module');};
  async function run(){
    await new AsyncFunction('FileManager','Request','Script','config','args','importModule',launcher)(
      FileManager,Request,Script,{runsInApp:true},{queryParameters:{}},importModule
    );
  }
  return {run,files,writes,requests,get completed(){return completed;},setOffline(v){offline=v;}};
}
test('trial launcher never writes, moves or removes installed Scriptable scripts',()=>{
  assert.match(launcher,/FileManager\.local\(\)/);
  assert.doesNotMatch(launcher,/FileManager\.iCloud\(\)/);
  assert.doesNotMatch(launcher,/\.move\(/);
  assert.match(launcher,/YOS_Remote_Trial_v1_cache\.json/);
  assert.match(launcher,/function previewImport\(name\)/);
  assert.match(launcher,/new Function\('module', b\.core/);
});
test('preview sources retain existing Sony and Tapo capabilities',()=>{
  assert.match(hub,/YOS Remote Hub v6\.6/);
  assert.match(hub,/bindTVSeekHold/);
  assert.match(hub,/async function controlFloor\(action,value\)/);
  assert.match(core,/clientForHost/);
});
test('trial first run downloads two programs, caches only data and translates existing names',async()=>{
  const h=fakeHarness();
  await h.run();
  assert.equal(h.completed,1);
  assert.equal(h.requests.length,2);
  assert.equal(h.writes.length,1);
  assert.match(h.writes[0],/cache\.json$/);
  assert.ok([...h.files.keys()].every(x=>!x.endsWith('.js')));
  h.setOffline(true);
  await h.run();
  assert.equal(h.completed,2);
  assert.equal(h.requests.length,2,'offline replay must use verified local cache');
});
test('network failure leaves installed scripts untouched',async()=>{
  const h=fakeHarness({offline:true});
  await assert.rejects(h.run(),/Network intentionally disabled/);
  assert.equal(h.files.size,0);
  assert.equal(h.writes.length,0);
});
