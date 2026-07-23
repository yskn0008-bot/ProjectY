'use strict';
(()=>{
  if(window.__yosLocationStatusV1)return;
  window.__yosLocationStatusV1=true;

  const style=document.createElement('style');
  style.textContent=`
    .yos-location-status{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 12px;padding:11px 12px;border:1px solid var(--line);border-radius:15px;background:rgba(23,23,25,.9)}
    .yos-location-status b{display:block;font-size:13px}
    .yos-location-status small{display:block;margin-top:2px;color:var(--muted);font-size:10px;line-height:1.45}
    .yos-location-status button{min-height:38px;padding:0 11px;border:1px solid var(--line);border-radius:11px;background:#222226;color:var(--text);font-size:11px;font-weight:900}
  `;
  document.head.appendChild(style);

  const phase=document.querySelector('.yos-shift-phase');
  const sub=document.querySelector('.sub');
  if(!sub)return;

  const section=document.createElement('section');
  section.className='yos-location-status';
  section.innerHTML='<div><b>現在地 未取得</b><small>停車後に「現在地を取得」を押す</small></div><button type="button">現在地を取得</button>';
  (phase||sub).insertAdjacentElement('afterend',section);

  const title=section.querySelector('b');
  const detail=section.querySelector('small');
  const button=section.querySelector('button');

  const showError=(message)=>{
    title.textContent='現在地を取得できません';
    detail.textContent=message;
    button.disabled=false;
    button.textContent='再試行';
    delete section.dataset.latitude;
    delete section.dataset.longitude;
    delete section.dataset.acquiredAt;
  };

  button.addEventListener('click',()=>{
    if(!navigator.geolocation){
      showError('このブラウザは位置情報に対応していません');
      return;
    }
    button.disabled=true;
    button.textContent='取得中…';
    title.textContent='現在地を確認中';
    detail.textContent='位置情報の許可が表示されたら許可してください';

    navigator.geolocation.getCurrentPosition(position=>{
      const {latitude,longitude,accuracy}=position.coords;
      const acquiredAt=Date.now();
      const acquiredTime=new Date(acquiredAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
      title.textContent='現在地 取得済み';
      detail.textContent=`${acquiredTime}取得 / 精度 約${Math.round(accuracy)}m`;
      button.disabled=false;
      button.textContent='更新';
      section.dataset.latitude=String(latitude);
      section.dataset.longitude=String(longitude);
      section.dataset.acquiredAt=String(acquiredAt);
    },error=>{
      const messages={
        1:'位置情報の利用が許可されていません',
        2:'現在地を特定できませんでした',
        3:'位置情報の取得が時間切れになりました'
      };
      showError(messages[error.code]||'位置情報の取得に失敗しました');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  });
})();