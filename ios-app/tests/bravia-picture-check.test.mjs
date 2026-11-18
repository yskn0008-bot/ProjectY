import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS BRAVIA Picture Check.js',import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));

function harness({hasKeys=true,unsupported=false}={}){
  const network=[],alerts=[],writes=[];
  const Keychain={
    contains:k=>hasKeys&&['yos.bravia.scriptable.host','yos.bravia.scriptable.psk'].includes(k),
    get:k=>k==='yos.bravia.scriptable.host'?'192.168.0.15':'secret-not-for-html',
    set:(...args)=>writes.push(args),
    remove:(...args)=>writes.push(args)
  };
  class Request{
    constructor(url){this.url=url}
    async loadString(){
      const body=JSON.parse(this.body);
      network.push({url:this.url,method:this.method,body,headers:this.headers});
      if(unsupported)return JSON.stringify({error:[404,'not supported']});
      const target=body.params[0].target;
      const entry=target==='pictureMode'?
        {target,currentValue:'standard',isAvailable:true,candidate:[{value:'standard'},{value:'cinema'}]}:
        {target,currentValue:'80',isAvailable:true,candidate:[{min:0,max:100,step:1}]};
      return JSON.stringify({result:[[entry]]});
    }
  }
  class Alert{
    addAction(){}
    async presentAlert(){alerts.push({title:this.title,message:this.message})}
  }
  const Script={complete(){}};
  const run=()=>new Function('Request','Keychain','Alert','Script','return (async()=>{'+source+'\n})()')(Request,Keychain,Alert,Script);
  return{run,network,alerts,writes};
}

test('shared installer registers picture diagnostic with immutable content digest',()=>{
  const item=catalog.targets.find(x=>x.id==='bravia-picture-check');
  assert.ok(item);
  assert.equal(item.name,'YOS BRAVIA Picture Check');
  assert.equal(item.path,'ios-app/scriptable/remote-widgets/YOS BRAVIA Picture Check.js');
  assert.equal(item.commit,'71504b0e8a7b51e6b403a312437c37152a7e7e20');
  assert.equal(item.sha256,crypto.createHash('sha256').update(source).digest('hex'));
  assert.match(source,/^\/\/ Variables used by Scriptable\./);
  assert.match(source,/^\/\/ YOS_SCRIPT_NAME: YOS BRAVIA Picture Check/m);
});

test('picture diagnostic reads only explicitly allowed BRAVIA endpoints',async()=>{
  const h=harness();await h.run();
  assert.equal(h.network.length,2);
  assert.deepEqual(h.network.map(x=>x.body.method),['getPictureQualitySettings','getPictureQualitySettings']);
  assert.deepEqual(h.network.map(x=>x.body.params[0].target),['pictureMode','brightness']);
  for(const n of h.network){
    assert.equal(n.url,'http://192.168.0.15/sony/video');
    assert.equal(n.method,'POST');
    assert.equal(n.body.version,'1.0');
  }
  assert.equal(h.writes.length,0);
  assert.equal(h.alerts.length,1);
  assert.match(h.alerts[0].message,/画質モード：取得できました/);
  assert.match(h.alerts[0].message,/明るさ：取得できました/);
  assert.doesNotMatch(h.alerts[0].message,/secret-not-for-html|192\.168\.0\.15/);
});

test('missing credentials fails closed without any network request',async()=>{
  const h=harness({hasKeys:false});await h.run();
  assert.equal(h.network.length,0);
  assert.equal(h.writes.length,0);
  assert.match(h.alerts[0].message,/接続設定がありません/);
});

test('unsupported API reports missing capability and does not change TV',async()=>{
  const h=harness({unsupported:true});await h.run();
  assert.equal(h.network.length,2);
  assert.deepEqual(h.network.map(x=>x.body.method),['getPictureQualitySettings','getPictureQualitySettings']);
  assert.match(h.alerts[0].message,/未確認/);
  assert.equal(h.writes.length,0);
});

test('source never contains mutation API or file write operations',()=>{
  assert.doesNotMatch(source,/setPictureQualitySettings|setPowerStatus|setAudioVolume|setPictureMode/);
  assert.doesNotMatch(source,/FileManager\.|Keychain\.(?:set|remove)|\.writeString\(/);
});
