'use strict';
(()=>{
  const SETTINGS_KEY='yos-home-settings-v2';
  const LEGACY_KEY='yos-home-settings-v1';
  const TAXI_KEY='yos-taxi-settings-v2';
  const input=document.getElementById('guideInput');
  const status=document.getElementById('guideStatus');
  const fallback=document.getElementById('guideFallback');
  const read=(key,fallbackValue)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallbackValue}catch{return fallbackValue}};
  const clean=(value,max=4000)=>typeof value==='string'?value.trim().slice(0,max):'';
  const nativeShell=location.protocol==='capacitor:'||location.protocol==='ionic:';
  const yosUrl=()=>{
    const current=read(SETTINGS_KEY,{});
    const legacy=read(LEGACY_KEY,{});
    const taxi=read(TAXI_KEY,{});
    return clean(current.yosUrl||legacy.yosUrl||taxi.yosUrl,500);
  };
  const helperText={
    normal:'今の状況を整理したい。何が起きているかを整理して、次の一手まで案内して。',
    build:'作る・直す・自動化したい。既存資産を先に確認し、必要な開発経路へ振り分けて完成条件まで進めて。',
    scout:'別の角度で確認したい。前提・見落とし・別解を独立した視点でも確認して。'
  };
  function buildPrompt(raw,mode='normal'){
    const original=clean(raw)||helperText[mode]||helperText.normal;
    const modeHint=mode==='build'?'開発・修理系の可能性あり':mode==='scout'?'独立した別視点の確認を希望':'通常相談';
    return [
      '【YOS相談・対処】',
      'original_input: '+original,
      'mode_hint: '+modeHint,
      '',
      'ユーザーにProject名・チャット・機能を選ばせず、内容からYOSが最終Routingしてください。',
      'Routing:',
      '・日常の相談／判断／予定／Money／Life／MY WAY／記録／通知／その他の日常運用 → YOS',
      '・作る／直す／自動化／統合／不具合／開発／Shortcut／アプリ／Remote等 → 必要ならProjectY。内部でOne Enter／プロト君／Astra／System Healthを必要時のみ使用',
      '・別視点／前提確認／見落とし／別案比較／独立した反証 → 必要ならSCOUT',
      '実行・確認していないものを成功扱いせず、必要な担当へRouting後、そのまま目的達成まで進めてください。'
    ].join('\n');
  }
  async function copyText(text){
    try{await navigator.clipboard.writeText(text);return true}catch{}
    try{
      const area=document.createElement('textarea');
      area.value=text;
      area.style.position='fixed';
      area.style.opacity='0';
      document.body.appendChild(area);
      area.select();
      const ok=document.execCommand('copy');
      area.remove();
      return ok;
    }catch{return false}
  }
  async function openYos(mode='normal'){
    const raw=clean(input?.value);
    if(!raw&&mode==='normal'){
      status.textContent='相談内容をそのまま入力してください。';
      input?.focus();
      return;
    }
    const prompt=buildPrompt(raw,mode);
    const copied=await copyText(prompt);
    if(!copied){
      status.textContent='相談内容をYOSへ渡せませんでした。入力内容は残っています。';
      return;
    }
    const url=yosUrl();
    if(url.startsWith('https://chatgpt.com/')){
      status.textContent='YOSへ渡します。行き先はYOSが決めます。';
      location.href=url;
      return;
    }
    if(fallback)fallback.hidden=false;
    status.textContent='相談内容をコピーしました。YOSチャットURLの登録が必要です。';
  }
  document.querySelectorAll('[data-native-only]').forEach(node=>{node.hidden=!nativeShell;node.style.display=nativeShell?'':'none'});
  document.querySelectorAll('[data-web-only]').forEach(node=>{node.hidden=nativeShell;node.style.display=nativeShell?'none':''});
  document.getElementById('askYos')?.addEventListener('click',()=>openYos('normal'));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>openYos(button.dataset.mode)));
  input?.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();openYos('normal')}
  });
  window.YOSGuideV1={buildPrompt};
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('../service-worker.js',{scope:'../',updateViaCache:'none'}).catch(()=>{}));
})();
