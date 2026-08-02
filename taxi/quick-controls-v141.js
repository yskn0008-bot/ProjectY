'use strict';
(()=>{
  if(window.__yosTaxiQuickControlsV141)return;
  window.__yosTaxiQuickControlsV141=true;

  const SETTINGS_KEY='yos-taxi-settings-v2';
  const DEST_KEY='yos-taxi-next-destination-v1';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function ensureSheet(){
    let sheet=document.getElementById('yos-quick-v141');
    if(sheet)return sheet;
    sheet=document.createElement('div');
    sheet.id='yos-quick-v141';
    sheet.hidden=true;
    sheet.innerHTML=`<button class="backdrop" type="button" aria-label="閉じる"></button><section role="dialog" aria-modal="true" aria-labelledby="yos-quick-title"><header><b id="yos-quick-title">営業クイック設定</b><button type="button" data-close>×</button></header><label>次の行き先<input name="destination" placeholder="例：北谷・久茂地"></label><div class="row"><label>目標金額<input name="target" type="number" inputmode="numeric" min="0" step="100"></label><label>勤務終了<input name="end" type="time"></label></div><p>営業画面の表示だけを素早く整えます。乗車記録や日報データは変更しません。</p><button class="save" type="button">保存して閉じる</button></section>`;
    document.body.appendChild(sheet);
    const close=()=>{sheet.hidden=true;document.documentElement.classList.remove('yos-quick-open')};
    sheet.querySelector('.backdrop').addEventListener('click',close);
    sheet.querySelector('[data-close]').addEventListener('click',close);
    sheet.querySelector('.save').addEventListener('click',()=>{
      const current=read(SETTINGS_KEY,{});
      current.targetSales=Math.max(0,Number(sheet.querySelector('[name="target"]').value)||0);
      current.plannedEnd=sheet.querySelector('[name="end"]').value||'03:30';
      save(SETTINGS_KEY,current);
      localStorage.setItem(DEST_KEY,sheet.querySelector('[name="destination"]').value.trim());
      window.dispatchEvent(new Event('storage'));
      close();
      mount();
    });
    return sheet;
  }

  function openSheet(){
    const sheet=ensureSheet();
    const settings=read(SETTINGS_KEY,{targetSales:0,plannedEnd:'03:30'});
    sheet.querySelector('[name="destination"]').value=localStorage.getItem(DEST_KEY)||'';
    sheet.querySelector('[name="target"]').value=Number(settings.targetSales)||0;
    sheet.querySelector('[name="end"]').value=settings.plannedEnd||'03:30';
    sheet.hidden=false;
    document.documentElement.classList.add('yos-quick-open');
    setTimeout(()=>sheet.querySelector('[name="destination"]').focus(),30);
  }

  function mount(){
    if(!(location.pathname.endsWith('/taxi/')||location.pathname.endsWith('/taxi/index.html')))return;
    const bar=document.getElementById('yos-drive-now-v138');
    if(!bar)return;
    bar.setAttribute('role','button');
    bar.setAttribute('tabindex','0');
    bar.setAttribute('aria-label','営業クイック設定を開く');
    if(!bar.dataset.quickBound){
      bar.dataset.quickBound='1';
      bar.addEventListener('click',openSheet);
      bar.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openSheet()}});
    }
    let dest=bar.querySelector('.destination-v141');
    if(!dest){dest=document.createElement('div');dest.className='destination-v141';bar.appendChild(dest)}
    const value=localStorage.getItem(DEST_KEY)||'';
    dest.innerHTML=`<small>次の行き先</small><strong>${value||'タップして設定'}</strong>`;
  }

  const observer=new MutationObserver(mount);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('storage',mount);
})();
