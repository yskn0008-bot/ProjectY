'use strict';
(()=>{
  if(window.__yosSettingsV20Loaded)return;
  window.__yosSettingsV20Loaded=true;

  const panels=[...document.querySelectorAll('.panel')];
  if(!panels.length)return;
  const groupFor=panel=>{
    const title=panel.querySelector('h2')?.textContent||'';
    if(title.includes('月と売上')||title.includes('目標配分'))return'sales';
    if(title.includes('設定結果'))return'result';
    return'work';
  };
  panels.forEach(panel=>panel.dataset.settingsGroup=groupFor(panel));

  const status=document.querySelector('.status');
  const nav=document.createElement('nav');
  nav.id='settingsTabsV20';
  nav.className='settings-tabs-v20';
  nav.innerHTML='<button data-tab="sales">売上</button><button data-tab="work">勤務</button><button data-tab="result">結果</button>';
  (status||document.querySelector('.top')).insertAdjacentElement('afterend',nav);

  const style=document.createElement('style');
  style.id='settingsCssV20';
  style.textContent=`
    .app{padding:calc(env(safe-area-inset-top) + 7px) 8px calc(env(safe-area-inset-bottom) + 72px)}
    .top{margin-bottom:7px;align-items:center}.top .eyebrow{display:none}.top h1{font-size:20px}.back{min-height:36px;padding:0 10px;font-size:11px}
    .notice:first-of-type{display:none}.status{padding:8px 10px;margin-bottom:6px;border-radius:13px}.status b{font-size:11px;margin-bottom:2px}.status p{font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .settings-tabs-v20{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:7px}.settings-tabs-v20 button{min-height:38px;border:1px solid var(--line);border-radius:11px;background:var(--panel2);color:var(--muted);font-weight:900}.settings-tabs-v20 button.active{border:0;background:linear-gradient(145deg,var(--amber),#ff7a00);color:#17100a}
    .panel{display:none;padding:10px;margin-bottom:6px;border-radius:15px}.panel.settings-active-v20{display:block}.panel h2{font-size:14px;margin-bottom:7px}.panel h2 small,.field small,.panel .notice{display:none}
    .fields{gap:6px}.row2,.row3{gap:6px}.field{gap:3px}.field label{font-size:9px}.field input,.field select{min-height:39px;border-radius:10px;padding:6px 8px;font-size:13px}
    .actions{gap:6px;margin-top:7px}.actions button{min-height:41px;border-radius:11px;font-size:11px}.actions.two{grid-template-columns:1fr 1fr}
    .mini{grid-template-columns:repeat(5,1fr);gap:4px}.metric{padding:8px 3px;border-radius:11px;text-align:center}.metric strong{font-size:12px}.metric span{font-size:7px}
    main.app>.actions{position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 7px);z-index:9;grid-template-columns:1.25fr .75fr;margin:0;padding:6px;border:1px solid var(--line);border-radius:15px;background:rgba(17,17,20,.96);backdrop-filter:blur(14px)}main.app>.actions .back{min-height:44px;font-size:10px}
    @media(max-width:390px){.row2,.row3{grid-template-columns:repeat(2,1fr)}.row3 .field:last-child{grid-column:1/-1}.mini{grid-template-columns:repeat(5,1fr)}}
  `;
  document.head.appendChild(style);

  let active=localStorage.getItem('yos-taxi-settings-tab-v20')||'sales';
  const show=tab=>{
    active=tab;
    localStorage.setItem('yos-taxi-settings-tab-v20',tab);
    panels.forEach(panel=>panel.classList.toggle('settings-active-v20',panel.dataset.settingsGroup===tab));
    nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
    if(tab==='result'&&typeof renderStats==='function')renderStats();
  };
  nav.querySelectorAll('button').forEach(button=>button.onclick=()=>show(button.dataset.tab));
  show(active);
})();
