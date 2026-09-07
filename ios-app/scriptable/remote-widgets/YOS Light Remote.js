// YOS Light Remote — Panasonic HK9494 via Tapo H110.
// Fast bounded hold mode: short IR bursts while held, heartbeat lease, no unbounded queue.

const tapo = importModule('YOS Tapo H110 Core');
const lightPredicate = r => /ライト|light/i.test(String(r.nickname||'')) || String(r.model||'').toLowerCase()==='light';
const remote = tapo.findRemote(lightPredicate);
if(!remote) throw new Error('ライト リモコンが見つかりません。YOS Tapo H110 Setup を再実行してください。');

const keys = {
  on: tapo.findKey(remote,['POWER ON','点灯']),
  off: tapo.findKey(remote,['POWER OFF','消灯']),
  all: tapo.findKey(remote,['全灯','All Lights']),
  bright: tapo.findKey(remote,['BRIGHTNESS+','明るくする','明るい']),
  dark: tapo.findKey(remote,['BRIGHTNESS-','暗くする','暗い']),
  night: tapo.findKey(remote,['常夜灯','Night Light'])
};
for(const [name,key] of Object.entries(keys)) if(!key) throw new Error(`${name} のIRキーが見つかりません。`);

const client = await tapo.client();
const HOLD_BURST = 6;
const HOLD_CADENCE_MS = 330;
const HOLD_LEASE_MS = 450;
let holdAction = null;
let holdToken = 0;
let holdLeaseUntil = 0;
let sendQueue = Promise.resolve();

function sleep(ms){
  return new Promise(resolve => Timer.schedule(ms / 1000, false, resolve));
}

async function fire(action){
  const key = keys[action];
  if(!key) return;
  await client.fire(remote.device_id,key.name);
}

async function fireHoldBurst(action){
  const key = keys[action];
  if(!key) return;
  await client.fireBurst(remote.device_id,key.name,HOLD_BURST);
}

async function showError(error){
  const a = new Alert();
  a.title = '照明';
  a.message = error && error.message ? error.message : String(error);
  a.addAction('OK');
  await a.presentAlert();
}

function enqueueFire(action){
  sendQueue = sendQueue.then(() => fire(action)).catch(async e => { await showError(e); });
  return sendQueue;
}

function stopHold(){
  holdAction = null;
  holdLeaseUntil = 0;
  holdToken += 1;
}

function renewHold(action){
  if(holdAction === action) holdLeaseUntil = Date.now() + HOLD_LEASE_MS;
}

function startHold(action){
  stopHold();
  holdAction = action;
  holdLeaseUntil = Date.now() + HOLD_LEASE_MS;
  const token = holdToken;
  (async()=>{
    try{
      while(holdAction === action && token === holdToken && Date.now() < holdLeaseUntil){
        const started = Date.now();
        await fireHoldBurst(action);
        if(holdAction !== action || token !== holdToken || Date.now() >= holdLeaseUntil) break;
        const wait = HOLD_CADENCE_MS - (Date.now() - started);
        if(wait > 0) await sleep(wait);
      }
      if(token === holdToken && Date.now() >= holdLeaseUntil) stopHold();
    }catch(e){
      stopHold();
      await showError(e);
    }
  })();
}

function parseBridge(url){
  const m = String(url || '').match(/^yoslight:\/\/([^?]+)(?:\?(.*))?$/i);
  if(!m) return null;
  const params = {};
  for(const part of String(m[2] || '').split('&')){
    if(!part) continue;
    const i = part.indexOf('=');
    const key = decodeURIComponent(i >= 0 ? part.slice(0,i) : part);
    const value = decodeURIComponent(i >= 0 ? part.slice(i+1) : '');
    params[key] = value;
  }
  return {path:m[1], params};
}

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
body{display:flex;align-items:center;justify-content:center;overscroll-behavior:none}
main{width:min(92vw,520px);padding:18px}
.head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
h1{margin:0;font-size:28px}.sub{color:#8e8e93;font-size:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
button{height:88px;border:0;border-radius:22px;background:#171717;color:#0a84ff;font-size:20px;font-weight:700;touch-action:none}
button:active,.holding{background:#2a2a2a;transform:scale(.985)}
.small{font-size:17px;color:#fff}
.note{text-align:center;color:#777;font-size:11px;margin-top:14px}
</style></head><body>
<main>
<div class="head"><h1>照明</h1><div class="sub">Panasonic HK9494</div></div>
<div class="grid">
<button data-tap="on">点灯</button>
<button data-tap="off">消灯</button>
<button id="bright">明るい</button>
<button id="dark">暗い</button>
<button class="small" data-tap="all">全灯</button>
<button class="small" data-tap="night">常夜灯</button>
</div>
<div class="note">明るい／暗い：押している間だけ高速調光</div>
</main>
<script>
function bridge(path, params={}){
  const q = Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
  location.href = 'yoslight://'+path+(q?'?'+q:'?')+(q?'&':'')+'_='+Date.now();
}

document.querySelectorAll('[data-tap]').forEach(b=>{
  b.addEventListener('click',()=>bridge('fire',{action:b.dataset.tap}));
});

function bindHold(id,action){
  const b = document.getElementById(id);
  let active = false;
  let heartbeat = null;
  const stop = e => {
    if(e) e.preventDefault();
    if(!active) return;
    active = false;
    b.classList.remove('holding');
    if(heartbeat){ clearInterval(heartbeat); heartbeat = null; }
    bridge('hold-stop',{action});
  };
  const start = e => {
    e.preventDefault();
    if(active) return;
    active = true;
    b.classList.add('holding');
    try{ b.setPointerCapture(e.pointerId); }catch(_){}
    bridge('hold-start',{action});
    heartbeat = setInterval(()=>{ if(active) bridge('hold-heartbeat',{action}); },120);
  };
  b.addEventListener('pointerdown',start);
  b.addEventListener('pointerup',stop);
  b.addEventListener('pointercancel',stop);
  b.addEventListener('lostpointercapture',stop);
  b.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) stop(); });
}
bindHold('bright','bright');
bindHold('dark','dark');
</script></body></html>`;

const web = new WebView();
web.shouldAllowRequest = request => {
  const url = request && request.url ? request.url : '';
  if(String(url).startsWith('yoslight://')){
    const evt = parseBridge(url);
    if(evt){
      if(evt.path === 'hold-start' && (evt.params.action === 'bright' || evt.params.action === 'dark')){
        startHold(evt.params.action);
      }else if(evt.path === 'hold-heartbeat'){
        renewHold(evt.params.action);
      }else if(evt.path === 'hold-stop'){
        stopHold();
      }else if(evt.path === 'fire'){
        enqueueFire(evt.params.action);
      }
    }
    return false;
  }
  return true;
};

await web.loadHTML(html);
await web.present(true);
stopHold();
await sendQueue;
Script.complete();
