// YOS AC Widget — SHARP A988JB frequent controls via Tapo H110.
// Header includes a visible launch icon for the full YOS AC Remote.

const tapo = importModule('YOS Tapo H110 Core');
const remote = tapo.findRemote(r => String(r.model||'').toUpperCase()==='AC' || /エアコン|air.?con/i.test(String(r.nickname||'')));
if(!remote) throw new Error('エアコン リモコンが見つかりません。YOS Tapo H110 Setup を再実行してください。');

function walk(value,out=[]){if(Array.isArray(value))for(const v of value)walk(v,out);else if(value&&typeof value==='object'){out.push(value);for(const v of Object.values(value))walk(v,out);}return out;}
async function getClientAndState(){
  const client=await tapo.client();
  const raw=await client.query({method:'control_child',params:{device_id:remote.device_id,requestData:{method:'get_device_info',params:null}}});
  const info=walk(raw,[]).find(x=>typeof x.ac_status==='string')||{};
  const s={};
  if(typeof info.ac_status==='string')for(const part of info.ac_status.split('_')){const m=String(part).match(/^([PMTSD])(-?\d+)$/);if(m)s[m[1]]=Number(m[2]);}
  if(s.P==null&&info.on!=null)s.P=Number(info.on);
  if(s.M==null&&info.ac_mode!=null)s.M=Number(info.ac_mode);
  if(s.T==null&&info.current_temp!=null)s.T=Number(info.current_temp);
  if(!Number.isFinite(s.P))s.P=0;
  if(!Number.isFinite(s.M))s.M=0;
  if(!Number.isFinite(s.T))s.T=26;
  if(!Number.isFinite(s.S))s.S=0;
  if(!Number.isFinite(s.D))s.D=6;
  return {client,state:s};
}
function payload(s){return{power:!!s.P,on:!!s.P,mode:Number(s.M),temp:Math.max(18,Math.min(30,Number(s.T)||26)),wind_speed:Math.max(0,Math.min(3,Number(s.S)||0)),wind_direct:Math.max(0,Math.min(6,Number(s.D)||0))};}
async function runAction(action){
  const {client,state:s}=await getClientAndState();
  if(action==='cool'){s.P=1;s.M=0;s.T=Math.max(18,Math.min(30,s.T||26));}
  else if(action==='dry'){s.P=1;s.M=4;s.S=0;}
  else if(action==='heat'){s.P=1;s.M=1;s.T=Math.max(18,Math.min(30,s.T||26));}
  else if(action==='stop'){s.P=0;}
  else if(action==='tempUp'){if(s.M===4)return;s.P=1;s.T=Math.min(30,(s.T||26)+1);}
  else if(action==='tempDown'){if(s.M===4)return;s.P=1;s.T=Math.max(18,(s.T||26)-1);}
  else if(action==='fan'){if(s.M===4)return;s.P=1;s.S=(s.S+1)%4;}
  else if(action==='wind'){s.P=1;s.D=(s.D+1)%7;}
  else throw new Error('不明なエアコン操作です。');
  await client.controlAc(remote.device_id,payload(s));
}
function runURL(action){return `scriptable:///run?scriptName=${encodeURIComponent('YOS AC Widget')}&action=${encodeURIComponent(action)}`;}
function remoteURL(){return `scriptable:///run?scriptName=${encodeURIComponent('YOS AC Remote')}`;}
const ACTIONS={
  cool:{label:'冷房',icon:'snowflake'},
  dry:{label:'除湿',icon:'drop'},
  heat:{label:'暖房',icon:'flame'},
  stop:{label:'停止',icon:'power'},
  tempDown:{label:'温度−',icon:'minus'},
  tempUp:{label:'温度＋',icon:'plus'},
  fan:{label:'風量',icon:'fanblades'},
  wind:{label:'風向',icon:'arrow.up.and.down'}
};
function addButton(row,name){
  const spec=ACTIONS[name];
  const s=row.addStack();
  s.layoutVertically();
  s.centerAlignContent();
  s.cornerRadius=15;
  s.backgroundColor=new Color('#191919');
  s.setPadding(6,5,5,5);
  s.size=new Size(68,54);
  s.url=runURL(name);
  const img=s.addImage(SFSymbol.named(spec.icon).image);
  img.imageSize=new Size(19,19);
  img.tintColor=new Color(name==='stop'?'#FF453A':'#0A84FF');
  s.addSpacer(2);
  const t=s.addText(spec.label);
  t.font=Font.semiboldSystemFont(11);
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
  w.backgroundColor=new Color('#000000');
  w.setPadding(10,10,10,10);
  const h=w.addStack();h.centerAlignContent();h.url=remoteURL();
  const title=h.addText('エアコン');title.font=Font.boldSystemFont(18);title.textColor=Color.white();
  h.addSpacer();
  const sub=h.addText('SHARP');sub.font=Font.systemFont(11);sub.textColor=new Color('#8E8E93');
  h.addSpacer(8);
  const open=h.addImage(SFSymbol.named('arrow.up.right.square.fill').image);open.imageSize=new Size(16,16);open.tintColor=new Color('#8E8E93');
  w.addSpacer(6);
  addBalancedRow(w,['cool','dry','heat','stop']);
  w.addSpacer(5);
  addBalancedRow(w,['tempDown','tempUp','fan','wind']);
  return w;
}
async function main(){
  const action=args.queryParameters&&args.queryParameters.action;
  if(action){
    try{await runAction(action);}catch(e){const a=new Alert();a.title='エアコン';a.message=e.message||String(e);a.addAction('OK');await a.presentAlert();}
    Script.complete();return;
  }
  const w=makeWidget();
  if(config.runsInWidget)Script.setWidget(w);else await w.presentMedium();
  Script.complete();
}
await main();