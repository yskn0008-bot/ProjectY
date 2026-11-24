import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS BRAVIA Picture Off.js',import.meta.url),'utf8');

async function run({supported=true,hasKey=true,systemStatus=200,irStatus=200,
  systemError=false,brokenJson=false,networkFailure=false,soapFault=false,inApp=true}={}){
  const calls=[],outputs=[],alerts=[],completed=[];
  const Keychain={
    contains:key=>hasKey&&['yos.bravia.scriptable.host','yos.bravia.scriptable.psk'].includes(key),
    get:key=>key.includes('.host')?'192.168.1.22':'secret'
  };
  class Request{
    constructor(url){this.url=url;this.response={statusCode:200};}
    async loadString(){
      calls.push({url:this.url,method:this.method,headers:this.headers,body:this.body});
      if(networkFailure)throw Error('network error contains potentially private device information');
      if(this.url.endsWith('/sony/system')){
        this.response.statusCode=systemStatus;
        if(brokenJson)return 'invalid';
        return JSON.stringify(systemError?{error:[1,'unsupported']}:{result:[{},supported?[{name:'PicOff',value:'AAAAAQAAAAEAAAA+Aw=='}]:[{name:'Home',value:'AAAAAQAAAAEAAABgAw=='}]]});
      }
      this.response.statusCode=irStatus;
      return soapFault?'<SOAP-ENV:Fault>Failed</SOAP-ENV:Fault>':'ok';
    }
  }
  class Alert{
    addAction(action){this.action=action;}
    async presentAlert(){alerts.push({title:this.title,message:this.message,action:this.action});}
  }
  const Script={setShortcutOutput:v=>outputs.push(v),complete:()=>completed.push(true)};
  const exec=new Function('Request','Keychain','Script','Alert','config','return (async()=>{'+source+'\n})()');
  await exec(Request,Keychain,Script,Alert,{runsInApp:inApp});
  return{calls,outputs,alerts,completed};
}

test('manual success: single TV-advertised IRCC, visible status is not a screen-off claim',async()=>{
  const r=await run();
  assert.equal(r.calls.length,2);
  assert.equal(r.calls[0].url,'http://192.168.1.22/sony/system');
  assert.match(r.calls[0].body,/getRemoteControllerInfo/);
  assert.equal(r.calls[1].url,'http://192.168.1.22/sony/ircc');
  assert.match(r.calls[1].body,/AAAAAQAAAAEAAAA\+Aw==/);
  assert.equal(r.calls[1].headers['X-Auth-PSK'],'secret');
  assert.match(r.alerts[0].title,/送信済み/);
  assert.match(r.outputs[0],/未確認/);
  assert.equal(r.completed.length,1);
});

test('unsupported TV has visible error and does not send IRCC',async()=>{
  const r=await run({supported:false});
  assert.equal(r.calls.length,1);assert.match(r.alerts[0].title,/未完了/);
  assert.match(r.alerts[0].message,/消画コマンドを公開していません/);
});

test('missing credentials never sends a TV command',async()=>{
  const r=await run({hasKey:false});
  assert.equal(r.calls.length,0);assert.match(r.outputs[0],/接続情報/);
});

test('HTTP 401 and 500 are not success (each step)',async()=>{
  for(const options of [{systemStatus:401},{irStatus:500}]){
    const r=await run(options);
    assert.match(r.outputs[0],/未完了/);
    assert.match(r.alerts[0].title,/未完了/);
  }
});

test('malformed data, API error and SOAP fault are not reported as success',async()=>{
  for(const options of [{brokenJson:true},{systemError:true},{soapFault:true}]){
    const r=await run(options);assert.match(r.outputs[0],/未完了/);
  }
});

test('network failure has user-readable warning without leaking host or PSK',async()=>{
  const r=await run({networkFailure:true});
  assert.match(r.alerts[0].message,/同じ自宅ネットワーク/);
  assert.doesNotMatch(r.outputs[0],/secret|192\.168\.1\.22|potentially private/);
});

test('background shortcut receives result without blocking Alert',async()=>{
  const r=await run({inApp:false});
  assert.equal(r.alerts.length,0);assert.equal(r.outputs.length,1);
  assert.equal(r.completed.length,1);
});

test('script never writes credentials, power status or other devices',()=>{
  assert.match(source,/YOS_SCRIPT_NAME: YOS BRAVIA Picture Off/);
  assert.doesNotMatch(source,/setPowerStatus|setPictureQualitySettings|Keychain\.set|FileManager\./);
});

test('existing shared installer entry remains a pinned and hash-checked target',()=>{
  const catalogPath=new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url);
  const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
  const item=catalog.targets.find(x=>x.id==='bravia-picture-off');
  assert.ok(item);assert.equal(item.name,'YOS BRAVIA Picture Off');
  assert.match(item.commit,/^[0-9a-f]{40}$/);
  assert.equal(item.sha256,crypto.createHash('sha256').update(source).digest('hex'));
});
