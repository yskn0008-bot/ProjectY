'use strict';
(()=>{
  if(window.__yosTaxiDriveV138)return;
  window.__yosTaxiDriveV138=true;

  const TAXI_KEY='yos-taxi-settings-v2';
  const OPS_KEY='yos-taxi-ops-v1';
  const money=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(value)||0);
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const minutesUntil=clock=>{
    if(!clock)return null;
    const [hour,minute]=String(clock).split(':').map(Number);
    if(!Number.isFinite(hour)||!Number.isFinite(minute))return null;
    const now=new Date();
    const end=new Date(now);
    end.setHours(hour,minute,0,0);
    if(end<=now)end.setDate(end.getDate()+1);
    return Math.max(0,Math.floor((end-now)/60000));
  };
  const duration=mins=>mins==null?'—':mins>=60?`${Math.floor(mins/60)}時間${mins%60}分`:`${mins}分`;

  function values(){
    const taxi=read(TAXI_KEY,{targetSales:0,plannedEnd:'03:30'});
    const ops=read(OPS_KEY,{events:[]});
    const rides=(Array.isArray(ops.events)?ops.events:[]).filter(event=>event.type==='降車');
    const sales=rides.reduce((sum,event)=>sum+(Number(event.fare)||0)+(Number(event.tip)||0),0);
    const target=Number(taxi.targetSales)||0;
    return{sales,target,remain:Math.max(0,target-sales),end:taxi.plannedEnd||'03:30',mins:minutesUntil(taxi.plannedEnd||'03:30')};
  }

  function render(){
    if(!(location.pathname.endsWith('/taxi/')||location.pathname.endsWith('/taxi/index.html')))return;
    const page=document.querySelector('.yos131-drive');
    const header=page?.querySelector('.yos131-header');
    if(!page||!header)return;
    let bar=document.getElementById('yos-drive-now-v138');
    if(!bar){
      bar=document.createElement('section');
      bar.id='yos-drive-now-v138';
      bar.className='yos-drive-now-v138';
      header.insertAdjacentElement('afterend',bar);
      page.classList.add('yos-drive-v138');
    }
    const data=values();
    const now=new Date();
    const fields=[
      ['clock','現在時刻',`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`],
      ['target','目標まで',money(data.remain)],
      ['remaining','残り勤務',duration(data.mins)],
    ];
    for(const [name,label,value] of fields){
      let field=bar.querySelector(`[data-drive-field="${name}"]`);
      if(!field){
        field=document.createElement('div');
        field.dataset.driveField=name;
        if(name==='clock')field.className='clock';
        field.innerHTML='<small></small><strong></strong>';
        bar.appendChild(field);
      }
      const small=field.querySelector('small');
      const strong=field.querySelector('strong');
      if(small.textContent!==label)small.textContent=label;
      if(strong.textContent!==value)strong.textContent=value;
    }
  }

  render();
  const observer=new MutationObserver(render);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(render,30000);
  window.addEventListener('storage',render);
})();
