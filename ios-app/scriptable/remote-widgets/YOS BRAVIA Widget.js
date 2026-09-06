// YOS BRAVIA Widget — Issue #297
// Medium Scriptable widget for stacking with Aircon / Light widgets.

const STORAGE={host:'yos.bravia.scriptable.host',psk:'yos.bravia.scriptable.psk'};
const ACTIONS={power:['poweroff','power'],input:['input'],home:['home'],volumeDown:['volumedown'],mute:['mute'],volumeUp:['volumeup']};

function secure(key){return Keychain.contains(key)?Keychain.get(key):''}
const host=secure(STORAGE.host),psk=secure(STORAGE.psk);

function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c])}
function env(code){return '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+esc(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>'}
async function request(url,opt){const r=new Request(url);r.method=opt.method;r.headers=opt.headers;if(opt.body)r.body=opt.body;const t=await r.loadString();const s=r.response?r.response.statusCode:0;if(s<200||s>=300)throw new Error('BRAVIA HTTP '+s);return t}
async function discover(){if(!host||!psk)throw new Error('BRAVIA設定がありません。先にフルリモコンを起動してください。');const t=await request('http://'+host+'/sony/system',{method:'POST',headers:{'Content-Type':'application/json','X-Auth-PSK':psk},body:JSON.stringify({method:'getRemoteControllerInfo',params:[],id:1,version:'1.0'})});const p=JSON.parse(t),list=p&&p.result&&p.result[1];if(!Array.isArray(list))throw new Error('BRAVIAコマンド取得失敗');return new Map(list.map(x=>[String(x.name).toLowerCase(),x.value]))}
async function send(action){const map=await discover();let code='';for(const a of ACTIONS[action]||[]){if(map.has(a)){code=map.get(a);break}}if(!code)throw new Error('未対応コマンド');await request('http://'+host+'/sony/ircc',{method:'POST',headers:{'Content-Type':'text/xml; charset=UTF-8','X-Auth-PSK':psk,SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'},body:env(code)})}
function runURL(action){return 'scriptable:///run?scriptName='+encodeURIComponent(Script.name())+'&action='+encodeURIComponent(action)}
function addButton(row,label,action){const s=row.addStack();s.layoutVertically();s.centerAlignContent();s.cornerRadius=12;s.backgroundColor=new Color('#171717');s.url=runURL(action);s.size=new Size(0,48);s.addSpacer();const t=s.addText(label);t.font=Font.mediumSystemFont(16);t.textColor=Color.blue();t.centerAlignText();s.addSpacer();return s}
function makeWidget(){const w=new ListWidget();w.backgroundColor=Color.black();w.setPadding(12,12,12,12);const top=w.addStack();top.centerAlignContent();const title=top.addText('BRAVIA');title.font=Font.boldSystemFont(21);title.textColor=Color.white();top.addSpacer();const open=top.addText('開く ›');open.font=Font.systemFont(12);open.textColor=Color.gray();top.url='scriptable:///run?scriptName='+encodeURIComponent('YOS BRAVIA Remote');w.addSpacer(10);let r=w.addStack();r.spacing=8;addButton(r,'⏻ 電源','power');addButton(r,'入力','input');addButton(r,'ホーム','home');w.addSpacer(8);r=w.addStack();r.spacing=8;addButton(r,'音量−','volumeDown');addButton(r,'ミュート','mute');addButton(r,'音量＋','volumeUp');return w}

const action=args.queryParameters.action||'';
if(action){try{await send(action)}catch(e){const a=new Alert();a.title='BRAVIA';a.message=e.message||String(e);a.addAction('OK');await a.presentAlert()}Script.complete();return}
const widget=makeWidget();
if(config.runsInWidget){Script.setWidget(widget)}else{await widget.presentMedium()}
Script.complete();