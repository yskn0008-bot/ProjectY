// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS BRAVIA Picture Off
// One-tap screen blanking while leaving the TV powered on.
// Uses only an IRCC code explicitly advertised by this BRAVIA.
// This does not toggle power and does not touch any other scripts or settings.
const H="yos.bravia.scriptable.host",P="yos.bravia.scriptable.psk";
function required(k){if(!Keychain.contains(k))throw Error("BRAVIA接続情報なし");const v=String(Keychain.get(k)||"");if(!v)throw Error("BRAVIA接続情報が空です");return v}
const host=required(H).trim().replace(/^https?:\/\//i,"").replace(/:\d+$/,"").replace(/\/$/,"");
if(!/^[a-zA-Z0-9.-]+$/.test(host))throw Error("BRAVIAの接続先が不正です");
const psk=required(P);
const req=new Request("http://"+host+"/sony/system");
req.method="POST";req.timeoutInterval=8;
req.headers={"Content-Type":"application/json","X-Auth-PSK":psk};
req.body=JSON.stringify({method:"getRemoteControllerInfo",params:[],id:1,version:"1.0"});
const info=JSON.parse(await req.loadString());
if(info&&info.error)throw Error("BRAVIAリモコン対応確認に失敗しました");
const commands=info&&info.result&&info.result[1];
if(!Array.isArray(commands))throw Error("BRAVIAの対応ボタン一覧が取得できません");
const command=commands.find(x=>x&&["pictureoff","picoff"].includes(String(x.name||"").toLowerCase())&&typeof x.value==="string"&&/^[a-zA-Z0-9+/]+={0,2}$/.test(x.value));
if(!command)throw Error("このBRAVIAに消画コマンドがありません。クイック設定の消画を使用してください。");
const r=new Request("http://"+host+"/sony/ircc");
r.method="POST";r.timeoutInterval=8;
r.headers={"Content-Type":"text/xml; charset=UTF-8","X-Auth-PSK":psk,SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'};
r.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+command.value+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';
await r.loadString();
const status=r.response?r.response.statusCode:0;
if(status<200||status>=300)throw Error("消画送信に失敗しました（HTTP "+status+"）");
Script.setShortcutOutput("BRAVIA消画コマンド送信済み（画面状態の読戻しは未対応）");
Script.complete();
