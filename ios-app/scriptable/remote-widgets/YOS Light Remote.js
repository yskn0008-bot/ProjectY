// YOS Light Remote — Panasonic HK9494 physical remote behavior via Tapo H110.
// Brightness buttons repeat while held and stop immediately when released.

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

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
body{display:flex;align-items:center;justify-content:center}
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
<div class="note">明るい／暗いは押している間だけ連続調光</div>
</main>
<script>
window.__yosQ=[];window.__yosWaiter=null;
window.__yosEmit=function(v){if(window.__yosWaiter){const r=window.__yosWaiter;window.__yosWaiter=null;r(v)}else window.__yosQ.push(v)};
window.__yosNext=function(){return new Promise(r=>{if(window.__yosQ.length)r(window.__yosQ.shift());else window.__yosWaiter=r})};
for(const b of document.querySelectorAll('[data-tap]')) b.addEventListener('click',()=>window.__yosEmit({type:'fire',action:b.dataset.tap}));
function bindHold(id,action){
 const b=document.getElementById(id);let timer=null;let active=false;
 const start=e=>{e.preventDefault();if(active)return;active=true;b.classList.add('holding');window.__yosEmit({type:'fire',action});timer=setInterval(()=>{if(active)window.__yosEmit({type:'fire',action})},220)};
 const stop=e=>{if(e)e.preventDefault();if(!active)return;active=false;b.classList.remove('holding');if(timer){clearInterval(timer);timer=null};window.__yosQ=window.__yosQ.filter(x=>!(x&&x.type==='fire'&&x.action===action));window.__yosEmit({type:'stop',action})};
 b.addEventListener('touchstart',start,{passive:false});b.addEventListener('touchend',stop,{passive:false});b.addEventListener('touchcancel',stop,{passive:false});
 b.addEventListener('pointerdown',start);b.addEventListener('pointerup',stop);b.addEventListener('pointercancel',stop);b.addEventListener('pointerleave',stop);
}
bindHold('bright','bright');bindHold('dark','dark');
</script></body></html>`;

const web = new WebView();
await web.loadHTML(html);
const presented = web.present(false);

async function fire(action){
  const key=keys[action];
  if(!key) return;
  await client.fire(remote.device_id,key.name);
}

try{
  while(true){
    const raw = await web.evaluateJavaScript(`window.__yosNext().then(v=>completion(JSON.stringify(v)))`, true);
    const evt = JSON.parse(String(raw));
    if(!evt) continue;
    if(evt.type==='fire') await fire(evt.action);
  }
}catch(_){
  // Closing the WebView ends the bridge loop.
}
await presented;
Script.complete();
