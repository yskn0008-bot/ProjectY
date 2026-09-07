// Shared Tapo H110 KLAP v2 core for Scriptable.
// Credentials and remote map are stored only in Scriptable Keychain.

const K = Object.freeze({
  host: 'yos.tapo.h110.host',
  user: 'yos.tapo.h110.user',
  pass: 'yos.tapo.h110.pass',
  map: 'yos.tapo.h110.remote-map'
});

function kc(key) { return Keychain.contains(key) ? Keychain.get(key) : ''; }
function concat(...parts) { return parts.flatMap(x => Array.from(x || [])); }
function utf8(s) { return Data.fromString(String(s)).getBytes(); }
function b64(bytes) { return Data.fromBytes(Array.from(bytes)).toBase64String(); }
function fromB64(s) { const d = Data.fromBase64String(s); return d ? d.getBytes() : []; }
function eq(a,b){ if(!a||!b||a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a[i]^b[i]; return x===0; }
function int32be(n){n|=0;return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
function readInt32be(bytes,off=0){return((bytes[off]<<24)|(bytes[off+1]<<16)|(bytes[off+2]<<8)|bytes[off+3])|0;}

class WebCryptoBox {
  constructor(){ this.web = new WebView(); }
  async init(){
    await this.web.loadURL('https://example.com/');
    const injected = await this.web.evaluateJavaScript(`(() => {
      window.b2u=function(s){const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a};
      window.u2b=function(a){let s='';const u=new Uint8Array(a);for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)};
      window.dg=async function(alg,s){return u2b(await crypto.subtle.digest(alg,b2u(s)))};
      window.ae=async function(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['encrypt']);return u2b(await crypto.subtle.encrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))};
      window.ad=async function(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['decrypt']);return u2b(await crypto.subtle.decrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))};
      window.rnd=function(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return u2b(a)};
      return String(!!(window.crypto&&crypto.subtle));
    })()`, false);
    if(String(injected)!=='true') throw new Error('暗号処理を初期化できませんでした。');
  }
  async call(expr){
    const js=`(() => {(async()=>{try{const value=await (${expr});completion(JSON.stringify({ok:1,v:value}));}catch(e){completion(JSON.stringify({ok:0,e:String(e)}));}})();return 'pending';})()`;
    const raw=await this.web.evaluateJavaScript(js,true);
    const out=JSON.parse(String(raw));
    if(!out.ok) throw new Error('暗号処理エラー: '+out.e);
    return out.v;
  }
  async digest(alg,bytes){return fromB64(await this.call(`dg(${JSON.stringify(alg)},${JSON.stringify(b64(bytes))})`));}
  async sha1(bytes){return this.digest('SHA-1',bytes);}
  async sha256(bytes){return this.digest('SHA-256',bytes);}
  async random(n){return fromB64(await this.call(`rnd(${Number(n)})`));}
  async aesEncrypt(key,iv,bytes){return fromB64(await this.call(`ae(${JSON.stringify(b64(key))},${JSON.stringify(b64(iv))},${JSON.stringify(b64(bytes))})`));}
  async aesDecrypt(key,iv,bytes){return fromB64(await this.call(`ad(${JSON.stringify(b64(key))},${JSON.stringify(b64(iv))},${JSON.stringify(b64(bytes))})`));}
}

class KlapV2 {
  constructor(host,username,password,crypto){this.host=host;this.username=username;this.password=password;this.crypto=crypto;this.cookie='';this.key=null;this.ivPrefix=null;this.sig=null;this.seq=0;}
  async post(path,bytes,cookie='',query=''){
    const r=new Request(`http://${this.host}/app/${path}${query}`);r.method='POST';r.timeoutInterval=8;r.headers={'Content-Type':'application/octet-stream'};if(cookie)r.headers.Cookie=cookie;r.body=Data.fromBytes(bytes);
    const data=await r.load();const status=r.response?r.response.statusCode:0;if(status<200||status>=300){const e=new Error(`H110通信エラー HTTP ${status}`);e.status=status;throw e;}return{bytes:data?data.getBytes():[],response:r.response||{}};
  }
  async authHash(){const u=await this.crypto.sha1(utf8(this.username));const p=await this.crypto.sha1(utf8(this.password));return this.crypto.sha256(concat(u,p));}
  async handshake(){
    const auth=await this.authHash();const local=await this.crypto.random(16);const h1=await this.post('handshake1',local);if(h1.bytes.length<48)throw new Error('H110のKLAP応答が不完全です。');
    const remote=h1.bytes.slice(0,16),serverHash=h1.bytes.slice(16,48),expected=await this.crypto.sha256(concat(local,remote,auth));if(!eq(expected,serverHash))throw new Error('Tapoアカウント認証に失敗しました。');
    const cookies=(h1.response&&h1.response.cookies)||[];const session=cookies.find(c=>c&&c.name==='TP_SESSIONID');if(!session)throw new Error('H110からセッションCookieを取得できませんでした。');this.cookie=`TP_SESSIONID=${session.value}`;
    await this.post('handshake2',await this.crypto.sha256(concat(remote,local,auth)),this.cookie);
    const keyHash=await this.crypto.sha256(concat(utf8('lsk'),local,remote,auth));const ivHash=await this.crypto.sha256(concat(utf8('iv'),local,remote,auth));const sigHash=await this.crypto.sha256(concat(utf8('ldk'),local,remote,auth));
    this.key=keyHash.slice(0,16);this.ivPrefix=ivHash.slice(0,12);this.seq=readInt32be(ivHash,28);this.sig=sigHash.slice(0,28);
  }
  async query(payload,retry=true){
    if(!this.key)await this.handshake();this.seq=(this.seq+1)|0;const seqBytes=int32be(this.seq),iv=concat(this.ivPrefix,seqBytes),clear=utf8(JSON.stringify(payload)),cipher=await this.crypto.aesEncrypt(this.key,iv,clear),signature=await this.crypto.sha256(concat(this.sig,seqBytes,cipher));
    try{const resp=await this.post('request',concat(signature,cipher),this.cookie,`?seq=${this.seq}`);if(resp.bytes.length<33)throw new Error('H110の暗号化応答が不完全です。');const plain=await this.crypto.aesDecrypt(this.key,iv,resp.bytes.slice(32)),text=Data.fromBytes(plain).toRawString();if(!text)throw new Error('H110応答を復号できませんでした。');const obj=JSON.parse(text);if(obj&&obj.error_code&&obj.error_code!==0)throw new Error(`Tapo error_code ${obj.error_code}`);return obj;}catch(e){if(retry&&(e.status===403||/session|security|403/i.test(String(e.message)))){this.key=null;this.cookie='';await this.handshake();return this.query(payload,false);}throw e;}
  }
  fire(deviceId,keyName){return this.query({method:'control_child',params:{device_id:deviceId,requestData:{method:'multipleRequest',params:{requests:[{method:'sendIrCmdById',params:{name:keyName}}]}}}});}
  controlAc(deviceId,state){return this.query({method:'control_child',params:{device_id:deviceId,requestData:{method:'multipleRequest',params:{requests:[{method:'sendIrCmdByStatus',params:state}]}}}});}
}

function getCredentials(){
  const host=kc(K.host),user=kc(K.user),pass=kc(K.pass);if(!host||!user||!pass)throw new Error('先に YOS Tapo H110 Setup を実行してください。');return{host,user,pass};
}
function getMap(){try{return JSON.parse(kc(K.map)||'[]');}catch(_){return[];}}
function findRemote(predicate){const map=getMap();return map.find(predicate)||null;}
function findKey(remote,candidates){
  if(!remote||!Array.isArray(remote.keys))return null;
  const norm=s=>String(s||'').trim().toLowerCase();
  for(const c of candidates){const n=norm(c);const k=remote.keys.find(x=>norm(x.name)===n||norm(x.label)===n);if(k)return k;}
  return null;
}
async function client(){const c=getCredentials();const crypto=new WebCryptoBox();await crypto.init();return new KlapV2(c.host,c.user,c.pass,crypto);}

async function fireFriendly(remotePredicate,keyCandidates){
  const remote=findRemote(remotePredicate);if(!remote)throw new Error('対象リモコンが見つかりません。Setupを再実行してください。');const key=findKey(remote,keyCandidates);if(!key)throw new Error('対象ボタンが見つかりません。');const c=await client();await c.fire(remote.device_id,key.name);return{remote,key};
}

module.exports={K,getCredentials,getMap,findRemote,findKey,client,fireFriendly};
