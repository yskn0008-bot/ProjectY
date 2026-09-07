// YOS BRAVIA Widget — Issue #297
// Medium widget stays compact; large widget exposes the everyday physical-remote controls.

const STORAGE={host:'yos.bravia.scriptable.host',psk:'yos.bravia.scriptable.psk'};
const ACTIONS={
  power:['poweroff','power'],input:['input'],home:['home'],back:['return','back'],
  up:['up'],left:['left'],confirm:['confirm','enter'],right:['right'],down:['down'],
  volumeDown:['volumedown'],mute:['mute'],volumeUp:['volumeup'],
  channelDown:['channeldown'],channelUp:['channelup'],
  play:['play'],pause:['pause'],stop:['stop'],rewind:['rewind'],forward:['forward']
};

function secure(key){return Keychain.contains(key)?Keychain.get(key):''}
const host=secure(STORAGE.host),psk=secure(STORAGE.psk);

function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c])}
function env(code){return '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+esc(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>'}
async function request(url,opt){const r=new Request(url);r.method=opt.method;r.headers=opt.headers;if(opt.body)r.body=opt.body;const t=await r.loadString();const s=r.response?r.response.statusCode:0;if(s<200||s>=300)throw new Error('BRAVIA HTTP '+s);return t}
async function discover(){if(!host||!psk)throw new Error('BRAVIA設定がありません。先にフルリモコンを起動してください。');const t=await request('http://'+host+'/sony/system',{method:'POST',headers:{'Content-Type':'application/json','X-Auth-PSK':psk},body:JSON.stringify({method:'getRemoteControllerInfo',params:[],id:1,version:'1.0'})});const p=JSON.parse(t),list=p&&p.result&&p.result[1];if(!Array.isArray(list))throw new Error('BRAVIAコマンド取得失敗');return new Map(list.map(x=>[String(x.name).toLowerCase(),x.value]))}
async function send(action){const map=await discover();let code='';for(const a of ACTIONS[action]||[]){if(map.has(a)){code=map.get(a);break}}if(!code)throw new Error('未対応コマンド');await request('http://'+host+'/sony/ircc',{method:'POST',headers:{'Content-Type':'text/xml; charset=UTF-8','X-Auth-PSK':psk,SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'},body:env(code)})}
function runURL(action){return 'scriptable:///run?scriptName='+encodeURIComponent(Script.name())+'&action='+encodeURIComponent(action)}
function remoteURL(){return 'scriptable:///run?scriptName='+encodeURIComponent('YOS BRAVIA Remote')}

function addButton(row,label,action,opt={}){
  const s=row.addStack();
  s.layoutVertically();
  s.centerAlignContent();
  s.cornerRadius=12;
  s.backgroundColor=new Color('#171717');
  s.url=opt.url||runURL(action);
  s.size=new Size(opt.width||72,opt.height||44);
  s.addSpacer();
  const t=s.addText(label);
  t.font=Font.mediumSystemFont(opt.font||13);
  t.textColor=action==='power'?new Color('#FF453A'):Color.blue();
  t.centerAlignText();
  s.addSpacer();
  return s;
}
function rowButtons(w,items,opt={}){
  const r=w.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  r.addSpacer();
  items.forEach((x,i)=>{
    if(i)r.addSpacer(opt.gap||6);
    addButton(r,x[0],x[1],{...opt,url:x[2]||null});
  });
  r.addSpacer();
  return r;
}
function header(w){
  const top=w.addStack();top.centerAlignContent();top.url=remoteURL();
  const title=top.addText('BRAVIA');title.font=Font.boldSystemFont(21);title.textColor=Color.white();
  top.addSpacer();
  const icon=top.addImage(SFSymbol.named('arrow.up.right.square.fill').image);
  icon.imageSize=new Size(17,17);icon.tintColor=new Color('#8E8E93');
}
function makeMedium(){
  const w=new ListWidget();
  w.backgroundColor=Color.black();
  w.setPadding(12,12,12,12);
  header(w);
  w.addSpacer(10);
  const o={width:88,height:48,font:15,gap:8};
  rowButtons(w,[['⏻ 電源','power'],['入力','input'],['ホーム','home']],o);
  w.addSpacer(8);
  rowButtons(w,[['音量−','volumeDown'],['ミュート','mute'],['音量＋','volumeUp']],o);
  return w;
}
function makeLarge(){
  const w=new ListWidget();
  w.backgroundColor=Color.black();
  w.setPadding(12,12,12,12);
  header(w);
  w.addSpacer(9);
  const o={width:72,height:43,font:13,gap:6};

  // Default order: core keys → navigation → volume → channel/playback → transport/open.
  rowButtons(w,[['⏻ 電源','power'],['入力','input'],['ホーム','home'],['戻る','back']],o);w.addSpacer(6);
  rowButtons(w,[['▲','up'],['◀','left'],['OK','confirm'],['▶','right']],o);w.addSpacer(6);
  rowButtons(w,[['▼','down'],['音量−','volumeDown'],['ミュート','mute'],['音量＋','volumeUp']],o);w.addSpacer(6);
  rowButtons(w,[['CH−','channelDown'],['CH＋','channelUp'],['再生','play'],['一時停止','pause']],o);w.addSpacer(6);
  rowButtons(w,[['停止','stop'],['巻戻し','rewind'],['早送り','forward'],['開く',null,remoteURL()]],o);
  return w;
}

const action=args.queryParameters.action||'';
if(action){try{await send(action)}catch(e){const a=new Alert();a.title='BRAVIA';a.message=e.message||String(e);a.addAction('OK');await a.presentAlert()}Script.complete();return}
const isLarge=config.widgetFamily==='large';
const widget=isLarge?makeLarge():makeMedium();
if(config.runsInWidget){Script.setWidget(widget)}else{if(isLarge)await widget.presentLarge();else await widget.presentMedium()}
Script.complete();