'use strict';
(()=>{
  const SETTINGS_KEY='yos-home-settings-v2';
  const LEGACY_KEY='yos-home-settings-v1';
  const TAXI_KEY='yos-taxi-settings-v2';
  const input=document.getElementById('guideInput');
  const status=document.getElementById('guideStatus');
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const clean=(value,max=1200)=>typeof value==='string'?value.trim().slice(0,max):'';
  const yosUrl=()=>{
    const current=read(SETTINGS_KEY,{});
    const legacy=read(LEGACY_KEY,{});
    const taxi=read(TAXI_KEY,{});
    return clean(current.yosUrl||legacy.yosUrl||taxi.yosUrl,500);
  };
  const prefixes={
    normal:'【YOS】状況を整理して、次にやることを1つだけ案内して。必要なら既存の適切な機能へ振り分けて。',
    build:'【YOS｜開発・修理】作る・直す・自動化したい。既存資産を先に確認し、必要ならProjectYへ振り分けて。新しいProjectは増やさず、壊れているなら修理を優先して。',
    scout:'【YOS｜別視点】この状況を独立した別視点でも確認したい。必要ならSCOUTへ振り分け、前提・見落とし・別解を短く確認して。'
  };
  async function openYos(mode='normal'){
    const text=clean(input?.value,1200);
    const prompt=[prefixes[mode]||prefixes.normal,text].filter(Boolean).join('\n\n');
    try{await navigator.clipboard.writeText(prompt)}catch{}
    const url=yosUrl();
    if(url.startsWith('https://chatgpt.com/')){location.href=url;return}
    status.textContent='YOSチャットURLが未設定です。MY WAYのメニュー → 設定 から登録してください。';
  }
  document.getElementById('askYos')?.addEventListener('click',()=>openYos('normal'));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>openYos(button.dataset.mode)));
})();