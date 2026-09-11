// YOS Light Widget — Panasonic HK9494 physical-button subset via Tapo H110.
// Requires YOS Tapo H110 Core.js and one successful YOS Tapo H110 Setup run.
// Home-screen widgets cannot measure press duration, so brightness is one small step per tap.
// Header includes a visible launch icon for the full YOS Light Remote.

const tapo = importModule('YOS Tapo H110 Core');
const ACTIONS = Object.freeze({
  on:     {label:'点灯', icon:'power',        keys:['POWER ON','点灯']},
  off:    {label:'消灯', icon:'poweroff',     keys:['POWER OFF','消灯']},
  all:    {label:'全灯', icon:'sun.max.fill', keys:['全灯','All Lights']},
  bright: {label:'明るい',icon:'sun.max',     keys:['BRIGHTNESS+','明るくする','明るい']},
  dark:   {label:'暗い', icon:'sun.min',      keys:['BRIGHTNESS-','暗くする','暗い']},
  night:  {label:'常夜灯',icon:'moon.fill',   keys:['常夜灯','Night Light']}
});

const lightPredicate = r => /ライト|light/i.test(String(r.nickname||'')) || String(r.model||'').toLowerCase()==='light';

async function runAction(name){
  const a=ACTIONS[name];
  if(!a) throw new Error('不明な照明操作です。');
  return tapo.fireFriendly(lightPredicate,a.keys);
}

function runURL(action){
  return `scriptable:///run?scriptName=${encodeURIComponent('YOS Light Widget')}&action=${encodeURIComponent(action)}`;
}
function remoteURL(){
  return `scriptable:///run?scriptName=${encodeURIComponent('YOS Light Remote')}`;
}

function addButton(row, action){
  const spec=ACTIONS[action];
  const s=row.addStack();
  s.layoutVertically();
  s.centerAlignContent();
  s.cornerRadius=15;
  s.backgroundColor=new Color('#191919');
  s.setPadding(6,5,5,5);
  s.size=new Size(82,54);
  s.url=runURL(action);
  const img=s.addImage(SFSymbol.named(spec.icon).image);
  img.imageSize=new Size(19,19);
  img.tintColor=new Color('#0A84FF');
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
  w.backgroundColor=new Color('#000000');
  w.setPadding(10,10,10,10);
  const h=w.addStack();h.centerAlignContent();h.url=remoteURL();
  const title=h.addText('照明');title.font=Font.boldSystemFont(18);title.textColor=Color.white();
  h.addSpacer();
  const sub=h.addText('Panasonic');sub.font=Font.systemFont(11);sub.textColor=new Color('#8E8E93');
  h.addSpacer(8);
  const open=h.addImage(SFSymbol.named('arrow.up.right.square.fill').image);open.imageSize=new Size(16,16);open.tintColor=new Color('#8E8E93');
  w.addSpacer(6);
  addBalancedRow(w,['on','off','all']);
  w.addSpacer(5);
  addBalancedRow(w,['bright','dark','night']);
  return w;
}

async function main(){
  const action=args.queryParameters && args.queryParameters.action;
  if(action){
    try{await runAction(action);}catch(e){const a=new Alert();a.title='照明';a.message=e.message||String(e);a.addAction('OK');await a.presentAlert();}
    Script.complete();return;
  }
  const w=makeWidget();
  if(config.runsInWidget){Script.setWidget(w);}else{await w.presentMedium();}
  Script.complete();
}

await main();