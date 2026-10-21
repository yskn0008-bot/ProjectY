// YOS Remote Direct Actions v1.0
// Shortcut parameter: "light on", "light off", "ac cool", "ac stop", "floor on", "floor off".
// No visible remote WebView. Existing installed modules and Keychain are not changed.
const parts=String(args.shortcutParameter||"").trim().toLowerCase().split(/\s+/);
const [device,action]=parts;
if(!["light","ac","floor"].includes(device))throw Error("device: light/ac/floor");
if(!["on","off","cool","dry","heat","stop"].includes(action))throw Error("action: on/off/cool/dry/heat/stop");
const core=importModule("YOS Tapo H110 Core");
if(device==="light"){
 if(!["on","off"].includes(action))throw Error("照明はon/offのみ");
 const predicate=r=>/ライト|light/i.test(String(r.nickname||""))||String(r.model||"").toLowerCase()==="light";
 await core.fireFriendly(predicate,action==="on"?["POWER ON","点灯"]:["POWER OFF","消灯"]);
}else if(device==="floor"){
 if(!["on","off"].includes(action))throw Error("ランプはon/offのみ");
 const key="yos.tapo.floor.local-host";
 if(!Keychain.contains(key))throw Error("フロアランプの接続先が未設定");
 const host=String(Keychain.get(key)).trim();
 if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))throw Error("IPアドレス不正");
 const client=await core.clientForHost(host);
 const raw=await client.query({method:"get_device_info",params:null});
 function findState(v){if(!v||typeof v!=="object")return null;if(typeof v.device_on==="boolean")return v.device_on;for(const x of Object.values(v)){const z=findState(x);if(z!==null)return z}return null}
 const current=findState(raw),wanted=action==="on";
 if(current===null)throw Error("電源状態不明のため送信中止");
 if(current!==wanted)await client.query({method:"set_device_info",params:{device_on:wanted}});
}else{
 const allowed=["cool","dry","heat","stop"];
 if(!allowed.includes(action))throw Error("エアコンはcool/dry/heat/stopのみ");
 // Reuse installed AC widget's verified command implementation without presenting its widget.
 const fm=FileManager.local();
 const path=fm.joinPath(fm.documentsDirectory(),"YOS AC Widget.js");
 if(!fm.fileExists(path))throw Error("既存のYOS AC Widget.jsが見つかりません");
 const source=fm.readString(path);
 const a={queryParameters:{action},shortcutParameter:null,widgetParameter:null};
 const fake={name:()=>"YOS AC Widget",complete:()=>{},setShortcutOutput:()=>{},setWidget:()=>{}};
 const cfg={runsInApp:true,runsInWidget:false,runsWithSiri:false,runsInNotification:false};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction("args","Script","config","importModule",source)(a,fake,cfg,importModule);
}
Script.setShortcutOutput(device+" "+action+" 完了");
Script.complete();
