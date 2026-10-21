// YOS BRAVIA Smart Power v1.0
// Shortcut parameter: on / off / status. No visible WebView.
const hostKey="yos.bravia.scriptable.host";
const pskKey="yos.bravia.scriptable.psk";
if(!Keychain.contains(hostKey)||!Keychain.contains(pskKey))throw Error("BRAVIA接続設定なし");
const host=String(Keychain.get(hostKey)).replace(/^https?:\/\//,"").replace(/\/$/,"");
const psk=Keychain.get(pskKey);
const action=String(args.shortcutParameter||args.queryParameters?.action||"on").trim().toLowerCase();
if(!["on","off","status"].includes(action))throw Error("on/off/statusを指定してください");
async function rpc(method,params){
 const r=new Request("http://"+host+"/sony/system");
 r.method="POST";r.timeoutInterval=8;
 r.headers={"Content-Type":"application/json","X-Auth-PSK":psk};
 r.body=JSON.stringify({method,params,id:1,version:"1.0"});
 const data=JSON.parse(await r.loadString());
 if(data.error)throw Error(JSON.stringify(data.error));
 return data.result;
}
const state=(await rpc("getPowerStatus",[]))?.[0]?.status;
if(!["active","standby"].includes(state))throw Error("電源状態不明。送信中止: "+state);
if(action!=="status" && (action==="on")!==(state==="active")){
 await rpc("setPowerStatus",[{status:action==="on"}]);
}
Script.setShortcutOutput(state==="active"?"ON":"OFF");
Script.complete();
