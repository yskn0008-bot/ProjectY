'use strict';
(()=>{
  if(window.__yosMapCollapseV1)return;
  window.__yosMapCollapseV1=true;

  const section=document.querySelector('.yos-area-map');
  const head=section?.querySelector('.yos-area-map__head');
  if(!section||!head)return;

  const style=document.createElement('style');
  style.textContent=`
    .yos-area-map__tools{display:flex;flex:none;align-items:center;gap:6px}
    .yos-area-map__toggle{min-height:34px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:#222226;color:var(--text);font-size:10px;font-weight:900}
    .yos-area-map.is-collapsed .yos-area-map__canvas,
    .yos-area-map.is-collapsed .yos-area-map__detail,
    .yos-area-map.is-collapsed .yos-area-map__legend{display:none}
    .yos-area-map.is-collapsed .yos-area-map__head{margin-bottom:0}
  `;
  document.head.appendChild(style);

  const badge=head.querySelector('.yos-area-map__badge');
  const tools=document.createElement('div');
  tools.className='yos-area-map__tools';
  const button=document.createElement('button');
  button.type='button';
  button.className='yos-area-map__toggle';
  button.setAttribute('aria-expanded','true');
  button.textContent='地図を閉じる';
  if(badge)tools.appendChild(badge);
  tools.appendChild(button);
  head.appendChild(tools);

  button.addEventListener('click',()=>{
    const collapsed=section.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded',String(!collapsed));
    button.textContent=collapsed?'地図を開く':'地図を閉じる';
  });
})();
