// YOS AC Remote — SHARP A988JB via Tapo H110.
// Standard AC controls use H110 sendIrCmdByStatus. Special SHARP-only buttons are intentionally not guessed.
// Fan/wind numeric status is intentionally hidden because Tapo values do not map reliably to human labels on this unit.

const tapo = importModule('YOS Tapo H110 Core');
const remote = tapo.findRemote(r => String(r.model||'').toUpperCase()==='AC' || /エアコン|air.?con/i.test(String(r.nickname||'')));
if(!remote) throw new Error('エアコン リモコンが見つかりません。YOS Tapo H110 Setup を再実行してください。');

const client = await tapo.client();
const MODES = Object.freeze({cool:0, heat:1, dry:4});

function walk(value,out=[]){
  if(Array.isArray(value)) for(const v of value) walk(v,out);
  else if(value && typeof value==='object'){
    out.push(value);
    for(const v of Object.values(value)) walk(v,out);
  }
  return out;
}

async function readState(){
  const raw = await client.query({
    method:'control_child',
    params:{device_id:remote.device_id,requestData:{method:'get_device_info',params:null}}
  });
  const info = walk(raw,[]).find(x => typeof x.ac_status==='string') || {};
  const s = {};
  if(typeof info.ac_status==='string'){
    for(const part of info.ac_status.split('_')){
      const m=String(part).match(/^([PMTSD])(-?\d+)$/);
      if(m) s[m[1]]=Number(m[2]);
    }
  }
  if(s.P==null && info.on!=null) s.P=Number(info.on);
  if(s.M==null && info.ac_mode!=null) s.M=Number(info.ac_mode);
  if(s.T==null && info.current_temp!=null) s.T=Number(info.current_temp);
  if(s.S==null && info.wind_speed!=null) s.S=Number(info.wind_speed);
  if(s.D==null && info.wind_direct!=null) s.D=Number(info.wind_direct);
  if(!Number.isFinite(s.P)) s.P=0;
  if(!Number.isFinite(s.M)) s.M=0;
  if(!Number.isFinite(s.T)) s.T=26;
  if(!Number.isFinite(s.S)) s.S=0;
  if(!Number.isFinite(s.D)) s.D=6;
  return s;
}

function payload(s){
  return {
    power:!!s.P,
    on:!!s.P,
    mode:Number(s.M),
    temp:Math.max(18,Math.min(30,Number(s.T)||26)),
    wind_speed:Math.max(0,Math.min(3,Number(s.S)||0)),
    wind_direct:Math.max(0,Math.min(6,Number(s.D)||0))
  };
}

let state = await readState();

async function send(next){
  state={...state,...next};
  await client.controlAc(remote.device_id,payload(state));
}

function modeName(s){
  if(!s.P) return '停止';
  if(s.M===0) return '冷房';
  if(s.M===1) return '暖房';
  if(s.M===4) return '除湿';
  return '運転中';
}

function uiState(){
  return {power:!!state.P, mode:modeName(state), temp:state.T, dry:state.M===4};
}

async function showError(error){
  const a=new Alert();
  a.title='エアコン';
  a.message=error&&error.message?error.message:String(error);
  a.addAction('OK');
  await a.presentAlert();
}

let web;
async function pushState(){
  if(!web) return;
  try{await web.evaluateJavaScript(`window.setState(${JSON.stringify(uiState())})`,false);}catch(_){ }
}

async function perform(action){
  if(action==='stop') await send({P:0});
  else if(action==='cool') await send({P:1,M:MODES.cool,T:Math.max(18,Math.min(30,state.T||26))});
  else if(action==='heat') await send({P:1,M:MODES.heat,T:Math.max(18,Math.min(30,state.T||26))});
  else if(action==='dry') await send({P:1,M:MODES.dry,S:0});
  else if(action==='tempUp'){
    if(state.M===MODES.dry) return;
    await send({P:1,T:Math.min(30,(state.T||26)+1)});
  }
  else if(action==='tempDown'){
    if(state.M===MODES.dry) return;
    await send({P:1,T:Math.max(18,(state.T||26)-1)});
  }
  else if(action==='fan'){
    if(state.M===MODES.dry) return;
    await send({P:1,S:(state.S+1)%4});
  }
  else if(action==='wind') await send({P:1,D:(state.D+1)%7});
}

let queue=Promise.resolve();
function enqueue(action){
  queue=queue.then(async()=>{await perform(action);await pushState();}).catch(async e=>{await showError(e);});
}

function parseBridge(url){
  const m=String(url||'').match(/^yosac:\/\/([^?]+)(?:\?(.*))?$/i);
  if(!m) return null;
  const params={};
  for(const part of String(m[2]||'').split('&')){
    if(!part) continue;
    const i=part.indexOf('=');
    const k=decodeURIComponent(i>=0?part.slice(0,i):part);
    const v=decodeURIComponent(i>=0?part.slice(i+1):'');
    params[k]=v;
  }
  return {path:m[1],params};
}

const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
body{overscroll-behavior:none}
main{height:100vh;width:100%;padding:12px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
.head{height:42px;display:flex;align-items:flex-end;justify-content:space-between;flex:0 0 auto}
h1{margin:0;font-size:28px;line-height:1}.sub{font-size:12px;color:#8e8e93}
.status{height:72px;flex:0 0 auto;background:#111;border-radius:20px;padding:12px 18px;display:grid;grid-template-columns:1fr 1fr;align-items:center}.mode{font-size:22px;font-weight:800}.temp{font-size:34px;font-weight:800;text-align:right}
.controls{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,minmax(0,1fr));gap:10px}
button{min-height:0;border:0;border-radius:22px;background:#171717;color:#0a84ff;font-size:22px;font-weight:780;touch-action:manipulation}button:active{background:#2a2a2a;transform:scale(.985)}button.stop{color:#ff453a}button:disabled{opacity:.35}
@media(max-height:720px){main{padding:9px;gap:8px}.head{height:34px}h1{font-size:24px}.status{height:58px;border-radius:17px}.mode{font-size:19px}.temp{font-size:29px}.controls{gap:8px}button{font-size:19px;border-radius:18px}}
</style></head><body><main><div class="head"><h1>エアコン</h1><div class="sub">SHARP A988JB</div></div><div class="status"><div class="mode" id="mode">-</div><div class="temp" id="temp">--°</div></div><div class="controls"><button data-action="cool">冷房</button><button data-action="dry">除湿</button><button data-action="heat">暖房</button><button class="stop" data-action="stop">停止</button><button id="down" data-action="tempDown">温度 ▼</button><button id="up" data-action="tempUp">温度 ▲</button><button id="fanBtn" data-action="fan">風量 切替</button><button data-action="wind">風向 切替</button></div></main><script>
function bridge(action){location.href='yosac://fire?action='+encodeURIComponent(action)+'&_='+Date.now()}
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>bridge(b.dataset.action)));
window.setState=function(s){document.getElementById('mode').textContent=s.mode;document.getElementById('temp').textContent=s.dry?'—':(s.temp+'°');document.getElementById('up').disabled=s.dry;document.getElementById('down').disabled=s.dry;document.getElementById('fanBtn').disabled=s.dry};
window.setState(${JSON.stringify(uiState())});
</script></body></html>`;

web=new WebView();
web.shouldAllowRequest=request=>{
  const url=request&&request.url?request.url:'';
  if(String(url).startsWith('yosac://')){
    const evt=parseBridge(url);
    if(evt&&evt.path==='fire') enqueue(evt.params.action);
    return false;
  }
  return true;
};
await web.loadHTML(html);
await web.present(true);
await queue;
Script.complete();
