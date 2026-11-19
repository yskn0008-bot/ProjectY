import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS BRAVIA Picture Off.js',import.meta.url),'utf8');

async function run({supported=true,hasKey=true,status=200}={}){
 const calls=[],outputs=[];
 const Keychain={
  contains:key=>hasKey&&['yos.bravia.scriptable.host','yos.bravia.scriptable.psk'].includes(key),
  get:key=>key.includes('.host')?'192.168.1.22':'secret'
 };
 class Request{
  constructor(url){this.url=url;this.response={statusCode:200};}
  async loadString(){
   calls.push({url:this.url,method:this.method,headers:this.headers,body:this.body});
   if(this.url.endsWith('/sony/system')){
    return JSON.stringify({result:[{},supported?[{name:'PicOff',value:'AAAAAQAAAAEAAAA+Aw=='}]:[{name:'Home',value:'AAAAAQAAAAEAAABgAw=='}]]});
   }
   this.response.statusCode=status;
   return 'ok';
  }
 }
 const Script={setShortcutOutput:v=>outputs.push(v),complete:()=>{}};
 const exec=new Function('Request','Keychain','Script','return (async()=>{'+source+'\n})()');
 await exec(Request,Keychain,Script);
 return{calls,outputs};
}

test('one-tap Picture Off sends only a TV-advertised IRCC code',async()=>{
 const r=await run();
 assert.equal(r.calls.length,2);
 assert.equal(r.calls[0].url,'http://192.168.1.22/sony/system');
 assert.match(r.calls[0].body,/getRemoteControllerInfo/);
 assert.equal(r.calls[1].url,'http://192.168.1.22/sony/ircc');
 assert.match(r.calls[1].body,/AAAAAQAAAAEAAAA\+Aw==/);
 assert.equal(r.calls[1].headers['X-Auth-PSK'],'secret');
 assert.equal(r.outputs.length,1);
});

test('unsupported TV does not send IRCC',async()=>{
 const calls=[];
 await assert.rejects(run({supported:false}),/消画コマンドがありません/);
});

test('missing paired credentials produces no TV commands',async()=>{
 await assert.rejects(run({hasKey:false}),/接続情報なし/);
});

test('HTTP error is not reported as successful',async()=>{
 await assert.rejects(run({status:500}),/送信に失敗しました/);
});

test('Picture Off script does not depend on new credentials or power writes',()=>{
 assert.match(source,/YOS_SCRIPT_NAME: YOS BRAVIA Picture Off/);
 assert.doesNotMatch(source,/setPowerStatus|setPictureQualitySettings|Keychain\.set|FileManager\./);
});
