'use strict';
(()=>{
  if(window.__yosTaxiDriveRefineV119)return;
  window.__yosTaxiDriveRefineV119=true;

  const OPS_KEY='yos-taxi-ops-v1';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const money=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(number(value));

  function metrics(){
    const state=read(OPS_KEY,{events:[]});
    const events=Array.isArray(state.events)?state.events:[];
    const rides=events.filter(event=>event?.type==='降車');
    const sales=rides.reduce((sum,event)=>sum+number(event.fare)+number(event.tip),0);
    const occupiedMs=rides.reduce((sum,event)=>sum+number(event.durationMs),0);
    const idleMs=rides.reduce((sum,event)=>sum+number(event.waitMs),0);
    const utilization=(occupiedMs+idleMs)>0?Math.round(occupiedMs/(occupiedMs+idleMs)*100):0;
    return{
      rides:rides.length,
      utilization,
      average:rides.length?Math.round(sales/rides.length):0
    };
  }

  function refine(){
    const page=document.querySelector('#yosReferencePerfectV111 .rp-page-drive');
    if(!page)return;

    const sales=page.querySelector('.rp-sales-card');
    const advice=page.querySelector('.yf-advice-v118');
    if(sales&&advice&&sales.nextElementSibling!==advice){
      sales.insertAdjacentElement('afterend',advice);
    }

    const kpi=page.querySelector('.rp-three-metrics');
    if(kpi){
      const value=metrics();
      kpi.innerHTML=`
        <div><span>実車回数</span><strong>${value.rides}回</strong></div>
        <div><span>実車率</span><strong>${value.utilization}%</strong></div>
        <div><span>平均単価</span><strong>${money(value.average)}</strong></div>`;
    }

    const action=page.querySelector('.rp-action-card h2');
    if(action)action.textContent='主操作';

    const status=page.querySelector('.rp-status-card');
    if(status)status.setAttribute('aria-label','現在の状況');
  }

  let raf=0;
  const schedule=()=>{
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      refine();
    });
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  addEventListener('storage',event=>{if(event.key===OPS_KEY)schedule()});
  setInterval(schedule,1500);
})();
