'use strict';
(()=>{
  if(window.__yosTaxiThemeV137)return;
  window.__yosTaxiThemeV137=true;

  const KEY='yos-taxi-ui-theme-v1';
  const THEMES=[
    {id:'minimal',name:'ミニマル',note:'標準・3秒判断'},
    {id:'night-gold',name:'ナイトゴールド',note:'現在の雰囲気を維持'},
    {id:'light',name:'ライト',note:'昼間に見やすい'},
    {id:'map',name:'マップ',note:'地図と需要確認向け'},
    {id:'hud',name:'HUD',note:'近未来・高コントラスト'}
  ];

  const stored=()=>{try{return localStorage.getItem(KEY)||'minimal'}catch{return'minimal'}};

  function apply(id){
    const selected=THEMES.some(theme=>theme.id===id)?id:'minimal';
    document.documentElement.dataset.yosTheme=selected;
    try{localStorage.setItem(KEY,selected)}catch{}
    document.querySelectorAll('#yos-theme-v137 [data-theme]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.theme===selected));
    });
    window.dispatchEvent(new CustomEvent('yos-taxi-theme-change',{detail:{theme:selected}}));
  }

  function markup(){
    return `<div class="yos-theme-sheet-head"><div><b>画面デザイン</b><small>営業中は「ミニマル」を推奨</small></div><button type="button" data-theme-close aria-label="閉じる">×</button></div><div class="yos-theme-grid">${THEMES.map(theme=>`<button type="button" data-theme="${theme.id}" aria-pressed="false"><b>${theme.name}</b><small>${theme.note}</small></button>`).join('')}</div>`;
  }

  function mountManage(){
    if(!location.pathname.endsWith('/calendar.html')||new URLSearchParams(location.search).get('page')!=='manage')return;
    const manage=document.querySelector('.yos131-manage');
    const header=manage?.querySelector('.yos131-header');
    if(!manage||!header)return;

    let trigger=header.querySelector('[data-theme-open]');
    if(!trigger){
      const right=header.lastElementChild;
      if(!right)return;
      trigger=document.createElement('button');
      trigger.type='button';
      trigger.className='yos131-icon-btn yos-theme-trigger';
      trigger.dataset.themeOpen='';
      trigger.setAttribute('aria-label','画面デザインを選ぶ');
      trigger.textContent='🎨';
      right.appendChild(trigger);
    }

    let dialog=document.getElementById('yos-theme-v137');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='yos-theme-v137';
      dialog.innerHTML=`<div class="yos-theme-backdrop" data-theme-close></div><section class="yos-theme-sheet">${markup()}</section>`;
      document.body.appendChild(dialog);
      dialog.addEventListener('click',event=>{
        const themeButton=event.target.closest('[data-theme]');
        if(themeButton){apply(themeButton.dataset.theme);return}
        if(event.target.closest('[data-theme-close]'))dialog.close();
      });
      dialog.addEventListener('close',()=>document.documentElement.classList.remove('yos-theme-open'));
    }

    trigger.onclick=()=>{
      apply(stored());
      document.documentElement.classList.add('yos-theme-open');
      if(!dialog.open)dialog.showModal();
    };
  }

  function mountSettings(){
    if(!location.pathname.endsWith('/settings.html'))return;
    if(document.getElementById('yos-theme-v137-settings'))return;
    const panels=[...document.querySelectorAll('.panel')];
    const anchor=panels.find(panel=>panel.textContent.includes('月と売上'))||panels[0];
    if(!anchor)return;
    const section=document.createElement('section');
    section.className='panel';
    section.id='yos-theme-v137-settings';
    section.innerHTML=`<h2>画面デザイン</h2><div class="yos-theme-grid">${THEMES.map(theme=>`<button type="button" data-theme="${theme.id}" aria-pressed="false"><b>${theme.name}</b><small>${theme.note}</small></button>`).join('')}</div>`;
    anchor.insertAdjacentElement('beforebegin',section);
    section.addEventListener('click',event=>{const button=event.target.closest('[data-theme]');if(button)apply(button.dataset.theme)});
    apply(stored());
  }

  function mount(){mountManage();mountSettings()}
  apply(stored());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('storage',event=>{if(event.key===KEY)apply(event.newValue||'minimal')});
})();
