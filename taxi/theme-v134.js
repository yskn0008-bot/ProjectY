'use strict';
(()=>{
  if(window.__yosTaxiThemeV134)return;
  window.__yosTaxiThemeV134=true;

  const KEY='yos-taxi-ui-theme-v1';
  const THEMES=[
    {id:'minimal',name:'ミニマル',note:'標準・3秒判断'},
    {id:'night-gold',name:'ナイトゴールド',note:'現在の雰囲気を維持'},
    {id:'light',name:'ライト',note:'昼間に見やすい'},
    {id:'map',name:'マップ',note:'地図と需要確認向け'},
    {id:'hud',name:'HUD',note:'近未来・高コントラスト'}
  ];

  function stored(){
    try{return localStorage.getItem(KEY)||'minimal'}catch{return'minimal'}
  }

  function apply(id){
    const selected=THEMES.some(theme=>theme.id===id)?id:'minimal';
    document.documentElement.dataset.yosTheme=selected;
    try{localStorage.setItem(KEY,selected)}catch{}
    document.querySelectorAll('#yos-theme-v134 [data-theme]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.theme===selected));
    });
    window.dispatchEvent(new CustomEvent('yos-taxi-theme-change',{detail:{theme:selected}}));
  }

  function panelMarkup(){
    return `<div class="yos-theme-title"><b>画面デザイン</b><small>営業中は「ミニマル」を推奨。いつでも元に戻せます。</small></div><div class="yos-theme-grid">${THEMES.map(theme=>`<button type="button" data-theme="${theme.id}" aria-pressed="false">${theme.name}<small>${theme.note}</small></button>`).join('')}</div>`;
  }

  function bind(section){
    section.addEventListener('click',event=>{
      const button=event.target.closest('[data-theme]');
      if(!button)return;
      apply(button.dataset.theme);
    });
    apply(stored());
  }

  function settingsPanel(){
    if(!location.pathname.endsWith('/settings.html'))return;
    if(document.getElementById('yos-theme-v134'))return;
    const panels=[...document.querySelectorAll('.panel')];
    const anchor=panels.find(panel=>panel.textContent.includes('月と売上'))||panels[0];
    if(!anchor)return;
    const section=document.createElement('section');
    section.className='panel';
    section.id='yos-theme-v134';
    section.innerHTML=`<h2>画面デザイン <small>営業中は「ミニマル」を推奨。いつでも元に戻せます。</small></h2><div class="yos-theme-grid">${THEMES.map(theme=>`<button type="button" data-theme="${theme.id}" aria-pressed="false">${theme.name}<small>${theme.note}</small></button>`).join('')}</div>`;
    anchor.insertAdjacentElement('beforebegin',section);
    bind(section);
  }

  function managePanel(){
    if(!location.pathname.endsWith('/calendar.html')||new URLSearchParams(location.search).get('page')!=='manage')return;
    if(document.getElementById('yos-theme-v134'))return;
    const manage=document.querySelector('.yos131-manage');
    const tiles=manage?.querySelector('.yos131-tiles');
    if(!manage||!tiles)return;
    const section=document.createElement('section');
    section.className='yos131-card yos-theme-manage';
    section.id='yos-theme-v134';
    section.innerHTML=panelMarkup();
    tiles.insertAdjacentElement('afterend',section);
    bind(section);
  }

  function mount(){settingsPanel();managePanel()}

  apply(stored());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  const observer=new MutationObserver(()=>mount());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('storage',event=>{if(event.key===KEY)apply(event.newValue||'minimal')});
})();
