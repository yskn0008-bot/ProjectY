/* Money uses the shared MY WAY shell. All amounts come from money-v2. */
'use strict';
(()=>{
  function boot(){
    const host=document.getElementById('moneyPage');
    if(!host)return;
    host.classList.add('money-reference-v1');
    const privacy=document.getElementById('moneyPrivacy');
    if(privacy)privacy.setAttribute('aria-label','金額の表示・非表示を切り替える');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
