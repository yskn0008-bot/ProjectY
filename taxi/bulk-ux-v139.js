'use strict';
(()=>{
  if(window.__yosTaxiBulkV139)return;
  window.__yosTaxiBulkV139=true;

  const qs=(s,r=document)=>r.querySelector(s);
  const page=()=>new URLSearchParams(location.search).get('page')||'';

  function mountToday(){
    if(!location.pathname.endsWith('/calendar.html')||page()!=='today')return;
    const root=qs('.yos131-today');
    if(!root||qs('#yos139-today-focus',root))return;
    const memo=qs('.yos131-memo',root);
    if(!memo)return;
    const wrap=document.createElement('section');
    wrap.id='yos139-today-focus';
    wrap.className='yos139-today-focus';
    wrap.innerHTML=`
      <button type="button" data-v139-focus="style"><span>今日の営業スタイル</span><b>できることを全力でやる</b></button>
      <button type="button" data-v139-focus="scene"><span>営業後の一言</span><b>今日のシーンを残す</b></button>`;
    memo.insertAdjacentElement('beforebegin',wrap);
    wrap.addEventListener('click',event=>{
      const key=event.target.closest('[data-v139-focus]')?.dataset.v139Focus;
      if(!key)return;
      const text=key==='style'?'できることを全力でやる。あとは、お任せ。':'今日、一番印象に残ったシーンは？';
      const value=prompt(text,localStorage.getItem(`yos-taxi-v139-${key}`)||'');
      if(value===null)return;
      localStorage.setItem(`yos-taxi-v139-${key}`,value.trim());
      event.target.closest('button').querySelector('b').textContent=value.trim()||text;
    });
    const style=localStorage.getItem('yos-taxi-v139-style');
    const scene=localStorage.getItem('yos-taxi-v139-scene');
    if(style)qs('[data-v139-focus="style"] b',wrap).textContent=style;
    if(scene)qs('[data-v139-focus="scene"] b',wrap).textContent=scene;
  }

  function mountCalendarHint(){
    if(!location.pathname.endsWith('/calendar.html'))return;
    const type=page();
    if(!['week','month'].includes(type))return;
    const root=qs(type==='week'?'.yos131-week':'.yos131-month');
    if(!root||qs('#yos139-calendar-hint',root))return;
    const hint=document.createElement('div');
    hint.id='yos139-calendar-hint';
    hint.className='yos139-calendar-hint';
    hint.textContent=type==='week'?'日を押すと目標・実績・予定を編集':'色で達成状況を確認。日を押すと詳細編集';
    root.appendChild(hint);
  }

  function mountManage(){
    if(!location.pathname.endsWith('/calendar.html')||page()!=='manage')return;
    const root=qs('.yos131-manage');
    if(!root)return;
    root.setAttribute('data-v139-ready','true');
  }

  function mount(){mountToday();mountCalendarHint();mountManage()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  const observer=new MutationObserver(mount);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
