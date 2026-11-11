import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Widget Link Repair.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function fixture(kind,wrong=true){
  const marker=kind==='light'?'tapo.fireFriendly(':'getClientAndState()';
  return [
    '// '+kind, 'async function unused(){/* '+marker+' */}',
    'function runURL(action){return "scriptable:///run?scriptName="+encodeURIComponent('+
      (wrong?JSON.stringify(kind==='light'?'YOS Light Widget':'YOS AC Widget'):'Script.name()')+
      ')+"&action="+encodeURIComponent(action);}',
    'function remoteURL(){return "scriptable:///run?scriptName=remote";}'
  ].join('\n');
}
function harness({failOnce=false}={}){
  const archives=new Map(),localFiles=new Map(),icloudFiles=new Map(),log=[];
  let breakNext=failOnce;
  for(const [name,content] of [
    ['照明ウィジェット.js',fixture('light')],
    ['エアコンウィジェット.js',fixture('ac')]])icloudFiles.set('/icloud/'+name,content);
  function manager(root,files){
    return{
      documentsDirectory:()=>root,
      joinPath:(a,b)=>a+'/'+b,
      fileExists:p=>files.has(p),
      isFileStoredIniCloud:()=>false,
      readString:p=>{if(!files.has(p))throw Error('not found '+p);return files.get(p);},
      writeString(p,t){
        files.set(p,String(t));log.push(p);
        if(breakNext&&p.endsWith('/エアコンウィジェット.js')){
          breakNext=false; files.set(p,'intentionally-corrupted');
        }
      }
    };
  }
  const local=manager('/local',localFiles),icloud=manager('/icloud',icloudFiles);
  const FileManager={local:()=>local,iCloud:()=>icloud};
  const mod={exports:{}};
  const tool=new Function('module','FileManager',source+'\nreturn module.exports;')(mod,FileManager);
  return{tool,localFiles,icloudFiles,log};
}
test('rewrites only widget self-run URLs to the actual Script.name()',async()=>{
  const h=harness();
  const original=h.icloudFiles.get('/icloud/照明ウィジェット.js');
  const r=await h.tool.repairWidgets();
  assert.deepEqual(r.updated.sort(),['エアコンウィジェット.js','照明ウィジェット.js']);
  assert.equal(h.localFiles.size,1);
  for(const text of h.icloudFiles.values()){
    assert.match(text,/encodeURIComponent\(Script\.name\(\)\)/);
    assert.doesNotMatch(text,/encodeURIComponent\("YOS /);
  }
  assert.match(original,/YOS Light Widget/);
  const again=await h.tool.repairWidgets();
  assert.equal(again.updated.length,0);
  assert.equal(h.localFiles.size,1);
});
test('failing verification restores both scripts with backup retained',async()=>{
  const h=harness({failOnce:true});
  const originals=new Map(h.icloudFiles);
  await assert.rejects(h.tool.repairWidgets(),/元に戻しました/);
  assert.deepEqual([...h.icloudFiles],[...originals]);
  assert.equal(h.localFiles.size,1);
});
test('reports missing widgets without ever creating installed scripts',async()=>{
  const h=harness();
  h.icloudFiles.clear();
  const r=await h.tool.repairWidgets();
  assert.deepEqual(r.missing.sort(),['ac','light']);
  assert.equal(h.localFiles.size,0);
});
test('hold loop retains stop/heartbeat while omitting the former 150ms delay',()=>{
  const hub=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Hub.js',import.meta.url),'utf8');
  assert.match(hub,/function stopTVHold\(\)/);
  assert.match(hub,/tvHoldHeartbeat/);
  assert.doesNotMatch(hub,/Timer\.schedule\(150/);
});
