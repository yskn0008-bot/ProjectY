// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS Timeline v0.5 — light gray compact non-overlap timeline; Notion read/write not connected.
const view=new WebView();
const html=`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>
*{box-sizing:border-box}html,body{margin:0;background:#f1f3f6;color:#203047;font:13px -apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased}header{padding:16px 18px 12px;background:#f8f9fb;border-bottom:1px solid #dbe1e9}header:before{content:'YOS / LIFE FLOW';display:block;color:#0a8a80;letter-spacing:2px;font-size:10px;font-weight:800;margin-bottom:6px}h2{font-size:21px;margin:0 0 6px;font-weight:800}header small{color:#607188;font-size:11px}.notice{margin:10px 14px 0;background:white;border:1px solid #dce3ed;border-radius:11px;padding:8px 11px;font-size:11px;color:#52657d}.legend{display:flex;gap:12px;margin:10px 16px 0;color:#52647a;font-size:10px}.legend b{font-weight:600}.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}.timeline{position:relative;margin:17px 13px 30px 11px;touch-action:pan-y}.hour{position:absolute;left:0;right:0;border-top:1px solid #dfe4eb}.hour span{position:absolute;top:-8px;color:#64748b;font-size:10px;font-variant-numeric:tabular-nums}.axis{position:absolute;left:49px;top:0;bottom:0;width:2px;background:#b6c5d5}.tick{position:absolute;left:46px;width:8px;height:8px;border-radius:50%;background:#4b91de;z-index:1}.card{position:absolute;left:62px;right:0;min-height:22px;border-radius:7px;padding:3px 8px;display:flex;align-items:center;gap:7px;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 2px 6px #263d571b;border:1px solid #8dbbf1;border-left:4px solid #1678dd;background:linear-gradient(90deg,#d3e7ff,#b5d7ff);color:#173a67}.card.habit{background:linear-gradient(90deg,#baf2da,#93e6c4);border-color:#5ec99c;border-left-color:#08a56c;color:#12553c}.card.suggest{background:linear-gradient(90deg,#e5d7ff,#cdb7ff);border-color:#af90ed;border-left-color:#8753d8;color:#4b2783}.card.warning{outline:2px solid #f39a45;outline-offset:-2px}.card{will-change:transform;transition:box-shadow .18s ease,filter .18s ease}.card.moving{transition:none;z-index:5;box-shadow:0 8px 22px #203c6c5c;transform:scale(1.01)}.card b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card small{margin-left:auto;flex-shrink:0;font-size:9px;font-variant-numeric:tabular-nums}.focus{position:sticky;bottom:10px;margin:0 14px 12px;padding:11px 12px;border:1px solid #b9cfe9;border-radius:12px;background:#ffffffed;box-shadow:0 5px 20px #223c5b24;display:none}.focus.show{display:block}.focus button{border:0;border-radius:8px;background:#146fc6;color:white;font-weight:700;padding:8px 12px;margin-top:7px}.focus p{margin:5px 0;color:#5c6e83;font-size:11px}
</style></head><body><header><h2>YOS タイムライン</h2><small>00:00–24:00　タップで拡大・長押しドラッグで移動</small></header><div class="notice" id="notice">仮データ・Notion未接続。変更は保存されません。</div><div class="legend"><span><i style="background:#1678dd"></i><b>固定予定</b></span><span><i style="background:#08a56c"></i><b>習慣・タスク</b></span><span><i style="background:#8753d8"></i><b>提案</b></span></div><div class="timeline" id="tl"><div class="axis"></div></div><div class="focus" id="focus"><b id="focusTitle"></b><p id="focusInfo"></p><button id="closeFocus">全体表示に戻す</button></div><script>
const tl=document.getElementById('tl'),note=document.getElementById('notice'),focus=document.getElementById('focus'),ft=document.getElementById('focusTitle'),fi=document.getElementById('focusInfo');
const items=[{id:1,t:'睡眠',s:0,d:390,f:1},{id:2,t:'朝の準備',s:390,d:30},{id:3,t:'朝食',s:420,d:30,f:1},{id:4,t:'ウォーキング',s:510,d:30},{id:5,t:'集中作業',s:600,d:90},{id:6,t:'昼食',s:720,d:45,f:1},{id:7,t:'会議',s:840,d:60,f:1},{id:8,t:'仕事',s:930,d:90},{id:9,t:'運動',s:1050,d:60},{id:10,t:'夕食',s:1140,d:45,f:1},{id:11,t:'入浴',s:1200,d:45},{id:12,t:'読書',s:1260,d:45},{id:13,t:'就寝準備',s:1320,d:60}];
const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const scale=Math.max(23,Math.min(31,(window.innerHeight-165)/24));
let zoom=null;
const yFor=m=>m/60*scale+(zoom!==null&&m>zoom?Math.min(100,(m-zoom)/60*50):0);
const vibrate=()=>{try{navigator.vibrate?.(8)}catch(e){}};
function render(){
 tl.querySelectorAll('.hour,.card,.tick').forEach(n=>n.remove());
 const bottom=yFor(1440);tl.style.height=(bottom+8)+'px';
 for(let h=0;h<=24;h++){const el=document.createElement('div');el.className='hour';el.style.top=yFor(h*60)+'px';el.innerHTML='<span>'+fmt(h*60)+'</span>';tl.append(el)}
 const sorted=[...items].sort((a,b)=>a.s-b.s||a.id-b.id);
 let lastBottom=-30;let pushed=0;
 sorted.forEach(item=>{
   const natural=yFor(item.s),top=Math.max(natural,lastBottom+2);
   if(top>natural+2)pushed++;
   lastBottom=top+23;
   const el=document.createElement('div');el.className='card '+(item.f?'fixed':item.id===9?'suggest':'habit');
   el.style.top=top+'px';el.style.height='22px';el.innerHTML='<b>'+item.t+'</b><small>'+fmt(item.s)+'–'+fmt(item.s+item.d)+'</small>';
   tl.append(el);
   const tick=document.createElement('div');tick.className='tick';tick.style.top=(natural-4)+'px';tl.append(tick);
   let downY=0,downS=0,downTop=0,moved=false,holding=false,pressTimer=null,activePointer=null,frame=0,latestY=0,previewS=item.s,lastHaptic=0;
   const timeLabel=el.querySelector('small');
   const paint=()=>{frame=0;if(!holding)return;const offset=latestY-downY;el.style.transform='translate3d(0,'+offset+'px,0) scale(1.015)';const next=Math.max(0,Math.min(1440-item.d,Math.round((downS+offset/scale*60)/5)*5));if(next!==previewS){previewS=next;timeLabel.textContent=fmt(next)+'–'+fmt(next+item.d);const now=performance.now();if(now-lastHaptic>75){lastHaptic=now;vibrate()}}};
   el.addEventListener('pointerdown',e=>{if(e.button!==0)return;downY=latestY=e.clientY;downS=previewS=item.s;downTop=top;moved=false;holding=false;activePointer=e.pointerId;el.setPointerCapture(e.pointerId);if(!item.f){pressTimer=setTimeout(()=>{holding=true;el.classList.add('moving');vibrate()},180)}});
   el.addEventListener('pointermove',e=>{if(e.pointerId!==activePointer)return;latestY=e.clientY;if(Math.abs(latestY-downY)>9&&!holding){clearTimeout(pressTimer);if(!item.f){holding=true;el.classList.add('moving')}}if(holding){moved=moved||Math.abs(latestY-downY)>3;if(!frame)frame=requestAnimationFrame(paint)}});
   const finish=(cancelled=false)=>{clearTimeout(pressTimer);if(frame){cancelAnimationFrame(frame);frame=0}if(activePointer===null)return;activePointer=null;el.classList.remove('moving');el.style.transform='';if(holding&&moved&&!cancelled){item.s=previewS;const clashes=items.filter(x=>x!==item&&item.s<x.s+x.d&&x.s<item.s+item.d);note.textContent=clashes.length?'時間が重複：'+clashes.map(x=>x.t).join('、'):'移動しました（未保存）';vibrate();render()}else if(!moved&&!cancelled){zoom=zoom===item.s?null:item.s;ft.textContent=item.t;fi.textContent=fmt(item.s)+'–'+fmt(item.s+item.d)+(item.f?'　固定予定':'　ドラッグで移動');focus.classList.toggle('show',zoom!==null);render()}holding=false};
   el.addEventListener('pointerup',()=>finish(false));el.addEventListener('pointercancel',()=>finish(true));
 });
 if(pushed)note.textContent='重なりを防ぐため '+pushed+' 件を縦にずらして表示（時刻はカード内に記載）';
}
document.getElementById('closeFocus').onclick=()=>{zoom=null;focus.classList.remove('show');render()};
render();
<\/script></body></html>`;
await view.loadHTML(html);await view.present(true);Script.complete();
