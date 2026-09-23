// YOS BRAVIA Widget — frequent BRAVIA controls for the Home Screen.
// Uses the same BRAVIA host / PSK Keychain settings as YOS BRAVIA Remote.

const STORAGE=Object.freeze({
  host:"yos.bravia.scriptable.host",
  psk:"yos.bravia.scriptable.psk"
});

const ALIASES=Object.freeze({
  power:["poweroff","power"],
  input:["input"],
  home:["home"],
  volumeDown:["volumedown"],
  mute:["mute"],
  volumeUp:["volumeup"]
});

const ACTIONS=Object.freeze({
  power:{label:"電源",icon:"power"},
  input:{label:"入力",icon:"rectangle.on.rectangle"},
  home:{label:"ホーム",icon:"house.fill"},
  volumeDown:{label:"音量−",icon:"speaker.minus.fill"},
  mute:{label:"ミュート",icon:"speaker.slash.fill"},
  volumeUp:{label:"音量＋",icon:"speaker.plus.fill"}
});

function secure(key){return Keychain.contains(key)?Keychain.get(key):""}
function normalizeHost(value){
  const host=String(value||"").trim().replace(/^https?:\/\//i,"").replace(/:\d+$/,"");
  if(!host||/[\s/?#]/.test(host))throw new Error("テレビのIPアドレスまたはホスト名を確認してください。");
  return host;
}
function xmlEscape(v){
  return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

async function discover(host,psk){
  const r=new Request("http://"+host+"/sony/system");
  r.method="POST";
  r.headers={"Content-Type":"application/json","X-Auth-PSK":psk};
  r.body=JSON.stringify({method:"getRemoteControllerInfo",params:[],id:1,version:"1.0"});
  const data=JSON.parse(await r.loadString());
  const commands=data&&data.result&&data.result[1];
  if(!Array.isArray(commands))throw new Error("BRAVIAコマンド取得失敗");
  const index=new Map();
  commands.forEach(item=>{
    if(item&&item.name&&item.value)index.set(String(item.name).toLowerCase(),String(item.value));
  });
  return index;
}

async function runAction(action){
  if(!ACTIONS[action])throw new Error("不明なBRAVIA操作です。");
  const host=normalizeHost(secure(STORAGE.host));
  const psk=secure(STORAGE.psk);
  if(!psk)throw new Error("BRAVIA PSK設定なし");
  const index=await discover(host,psk);
  let code=null;
  for(const alias of ALIASES[action]||[]){
    if(index.has(alias.toLowerCase())){code=index.get(alias.toLowerCase());break;}
  }
  if(!code)throw new Error("このテレビでは未対応です："+action);
  const r=new Request("http://"+host+"/sony/ircc");
  r.method="POST";
  r.headers={
    "Content-Type":"text/xml; charset=UTF-8",
    "X-Auth-PSK":psk,
    SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
  };
  r.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+xmlEscape(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';
  await r.loadString();
}

function runURL(action){
  return `scriptable:///run?scriptName=${encodeURIComponent("YOS BRAVIA Widget")}&action=${encodeURIComponent(action)}`;
}
function remoteURL(){
  return `scriptable:///run?scriptName=${encodeURIComponent("YOS BRAVIA Remote")}`;
}

function addButton(row,action){
  const spec=ACTIONS[action];
  const s=row.addStack();
  s.layoutVertically();
  s.centerAlignContent();
  s.cornerRadius=15;
  s.backgroundColor=new Color("#191919");
  s.setPadding(6,5,5,5);
  s.size=new Size(82,54);
  s.url=runURL(action);
  const img=s.addImage(SFSymbol.named(spec.icon).image);
  img.imageSize=new Size(19,19);
  img.tintColor=new Color(action==="power"?"#FF453A":"#0A84FF");
  s.addSpacer(2);
  const t=s.addText(spec.label);
  t.font=Font.semiboldSystemFont(12);
  t.textColor=Color.white();
  t.centerAlignText();
}

function addBalancedRow(w,names){
  const row=w.addStack();
  row.layoutHorizontally();
  row.addSpacer();
  for(const name of names){addButton(row,name);row.addSpacer();}
}

function makeWidget(){
  const w=new ListWidget();
  w.backgroundColor=new Color("#000000");
  w.setPadding(10,10,10,10);
  const h=w.addStack();
  h.centerAlignContent();
  h.url=remoteURL();
  const title=h.addText("BRAVIA");
  title.font=Font.boldSystemFont(18);
  title.textColor=Color.white();
  h.addSpacer();
  const sub=h.addText("テレビ");
  sub.font=Font.systemFont(11);
  sub.textColor=new Color("#8E8E93");
  h.addSpacer(8);
  const open=h.addImage(SFSymbol.named("arrow.up.right.square.fill").image);
  open.imageSize=new Size(16,16);
  open.tintColor=new Color("#8E8E93");
  w.addSpacer(6);
  addBalancedRow(w,["power","input","home"]);
  w.addSpacer(5);
  addBalancedRow(w,["volumeDown","mute","volumeUp"]);
  return w;
}

async function main(){
  const action=args.queryParameters&&args.queryParameters.action;
  if(action){
    try{await runAction(action);}
    catch(e){
      const a=new Alert();
      a.title="BRAVIA";
      a.message=e&&e.message?e.message:String(e);
      a.addAction("OK");
      await a.presentAlert();
    }
    Script.complete();
    return;
  }
  const w=makeWidget();
  if(config.runsInWidget)Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
}

await main();
