'use strict';
(()=>{
  if(window.__yosNicheDemandV1)return;
  window.__yosNicheDemandV1=true;

  const grid=document.querySelector('.grid');
  if(!grid)return;

  const params=new URLSearchParams(location.search);
  const destination=String(params.get('niche')||'').trim();
  const label=String(params.get('nicheLabel')||'ニッチ需要').trim()||'ニッチ需要';
  const action=String(params.get('nicheAction')||'時間限定の需要は未設定').trim()||'時間限定の需要は未設定';
  const enabled=destination.length>0;

  const style=document.createElement('style');
  style.textContent='.purple .bar{background:#b89cff}.card.niche-demand{border-color:rgba(184,156,255,.34);background:linear-gradient(145deg,rgba(184,156,255,.11),var(--panel) 68%)}.card.niche-demand button:disabled{background:#202024;color:var(--muted);cursor:not-allowed;opacity:.75}';
  document.head.appendChild(style);

  const article=document.createElement('article');
  article.className='card purple niche-demand';
  article.innerHTML='<i class="bar"></i><div><b></b><small></small></div><button type="button"></button>';
  const name=article.querySelector('b');
  const detail=article.querySelector('small');
  const button=article.querySelector('button');
  name.textContent=label;
  detail.textContent=action;
  button.textContent=enabled?'ナビ':'未設定';
  button.disabled=!enabled;
  grid.appendChild(article);

  const openMaps=()=>{
    if(!enabled)return;
    if(!navigator.onLine){
      alert('通信できません。通信復旧後、停車した状態で案内を開始してください');
      return;
    }
    const url=new URL('https://www.google.com/maps/dir/');
    const locationStatus=document.querySelector('.yos-location-status');
    const latitude=locationStatus?.dataset.latitude;
    const longitude=locationStatus?.dataset.longitude;
    const accuracy=Number(locationStatus?.dataset.accuracy||NaN);
    const acquiredAt=Number(locationStatus?.dataset.acquiredAt||0);
    const locationIsFresh=acquiredAt>0&&Date.now()-acquiredAt<=5*60*1000;
    const locationIsAccurate=Number.isFinite(accuracy)&&accuracy<=200;
    url.searchParams.set('api','1');
    if(latitude&&longitude&&locationIsFresh&&locationIsAccurate)url.searchParams.set('origin',`${latitude},${longitude}`);
    url.searchParams.set('destination',destination);
    url.searchParams.set('travelmode','driving');
    url.searchParams.set('dir_action','navigate');
    location.href=url.toString();
  };

  button.addEventListener('click',openMaps);
})();
