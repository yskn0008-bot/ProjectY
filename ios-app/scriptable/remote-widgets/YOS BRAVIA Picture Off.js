// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS BRAVIA Picture Off
// One-tap screen blanking while leaving the TV powered on.
// Only use an IRCC code explicitly advertised by the BRAVIA.
// Report command transmission, never claim that the picture was verified off.
// Preserve existing credentials, installed remotes, shortcuts, and other devices.
const H="yos.bravia.scriptable.host",P="yos.bravia.scriptable.psk";
function required(k){
  if(!Keychain.contains(k))throw Error("BRAVIA接続情報がありません。既存リモコンの接続設定を確認してください。");
  const value=String(Keychain.get(k)||"");
  if(!value)throw Error("BRAVIA接続情報が空です。既存リモコンの接続設定を確認してください。");
  return value;
}
function httpStatus(request){return request.response?Number(request.response.statusCode)||0:0}
function checkStatus(request,step){
  const status=httpStatus(request);
  if(status===401||status===403)throw Error(step+"：テレビの認証に失敗しました（HTTP "+status+"）。");
  if(status<200||status>=300)throw Error(step+"：テレビが送信要求を受け付けませんでした（HTTP "+status+"）。");
}
async function read(request,step){
  let body;
  try{body=await request.loadString()}
  catch(_){throw Error(step+"：テレビと通信できません。iPhoneとテレビが同じ自宅ネットワークにあるか確認してください。")}
  checkStatus(request,step);
  return body;
}
async function sendPictureOff(){
  const host=required(H).trim().replace(/^https?:\/\//i,"").replace(/:\d+$/,"").replace(/\/$/,"");
  if(!/^[a-zA-Z0-9.-]+$/.test(host))throw Error("BRAVIAの接続先が不正です。");
  const psk=required(P);
  const request=new Request("http://"+host+"/sony/system");
  request.method="POST";request.timeoutInterval=8;
  request.headers={"Content-Type":"application/json","X-Auth-PSK":psk};
  request.body=JSON.stringify({method:"getRemoteControllerInfo",params:[],id:1,version:"1.0"});
  const response=await read(request,"対応ボタン確認");
  let info;
  try{info=JSON.parse(response)}catch(_){throw Error("BRAVIAの対応ボタン情報を読み取れませんでした。")}
  if(info&&info.error)throw Error("BRAVIAから対応ボタン確認のエラーが返されました。");
  const commands=info&&info.result&&info.result[1];
  if(!Array.isArray(commands))throw Error("BRAVIAの対応ボタン一覧が取得できません。");
  const command=commands.find(x=>x&&["pictureoff","picoff"].includes(String(x.name||"").toLowerCase())&&typeof x.value==="string"&&/^[a-zA-Z0-9+/]+={0,2}$/.test(x.value));
  if(!command)throw Error("このBRAVIAは消画コマンドを公開していません。テレビ本体のクイック設定から消画をお試しください。");
  const ir=new Request("http://"+host+"/sony/ircc");
  ir.method="POST";ir.timeoutInterval=8;
  ir.headers={"Content-Type":"text/xml; charset=UTF-8","X-Auth-PSK":psk,SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'};
  ir.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+command.value+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';
  const result=await read(ir,"消画送信");
  if(/<(?:[a-zA-Z0-9_.-]+:)?Fault(?:\s|>)/i.test(result))throw Error("消画送信：テレビから操作エラーが返されました。");
  return "消画コマンドの送信要求にテレビから正常なHTTP応答がありました。画面が実際に消えたかは未確認です。";
}
async function showResult(title,message){
  // Scriptable's editor/app needs visible results; background Shortcuts use output.
  if(typeof config==="undefined"||!config.runsInApp||typeof Alert==="undefined")return;
  const alert=new Alert();alert.title=title;alert.message=message;
  alert.addAction("閉じる");await alert.presentAlert();
}
async function main(){
  try{
    const output=await sendPictureOff();
    if(typeof Script.setShortcutOutput==="function")Script.setShortcutOutput("送信済み："+output);
    await showResult("BRAVIA 消画｜送信済み",output);
  }catch(error){
    const message=error&&error.message?String(error.message):"消画処理でエラーが発生しました。";
    if(typeof Script.setShortcutOutput==="function")Script.setShortcutOutput("未完了："+message);
    await showResult("BRAVIA 消画｜未完了",message);
  }finally{
    Script.complete();
  }
}
await main();
