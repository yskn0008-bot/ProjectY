'use strict';
(()=>{
  if(window.__yosPageSwipeV47)return;
  window.__yosPageSwipeV47=true;

  const KEY='yos-taxi-ui-v24';
  const META={
    drive:{label:'営業',icon:'🚖'},
    today:{label:'今日',icon:'◉'},
    week:{label:'週間',icon:'▦'},
    month:{label:'月間',icon:'▤'},
    manage:{label:'管理',icon:'⚙︎'}
  };
  const DEFAULT=['drive','today','week','month','manage'];
  const FIXED=new Set(['drive','manage']);
  const byId=id=>document.getElementById(id);

  function read(){
    try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return{}}
  }
  function safeOrder(value){
    const source=Array.isArray(value)?value:[];
    const unique=source.filter((key,index)=>META[key]&&source.indexOf(key)===index);
    return [...unique,...DEFAULT.filter(key=>!unique.includes(key))];
  }
  function safeVisible(value){
    const source=Array.isArray(value)?value:DEFAULT;
    const visible=source.filter((key,index)=>META[key]&&source.indexOf(key)===index);
    FIXED.forEach(key=>{if(!visible.includes(key))visible.push(key)});
    return visible;
  }
  function prefs(){
    const value=read();
    return {...value,pageOrder:safeOrder(value.pageOrder),visiblePages:safeVisible(value.visiblePages)};
  }
  function write(value){
    localStorage.setItem(KEY,JSON.stringify({...value,pageOrder:safeOrder(value.pageOrder),visiblePages:safeVisible(value.visiblePages)}));
  }
  function enabledOrder(value=prefs()){
    return value.pageOrder.filter(key=>value.visiblePages.includes(key));
  }
  function currentPage(){
    const path=location.pathname;
    if(path.endsWith('/taxi/')||path.endsWith('/taxi/index.html'))return'drive';
    if(path.endsWith('/taxi/settings.html'))return'manage';
    const query=new URLSearchParams(location.search).get('page');
    if(['today','week','month','manage'].includes(query))return query;
    return document.body.dataset.calendarPage||localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
  }
  function url(key){return key==='drive'?'./index.html':`./calendar.html?page=${key}`}
  function go(key){if(META[key])location.href=url(key)}

  function applyNav(){
    const nav=byId('taxiGlobalNavV24');
    if(!nav)return false;
    const order=enabledOrder();
    const current=[...nav.querySelectorAll('button[data-page]')].map(button=>button.dataset.page);
    if(current.join('|')!==order.join('|')){
      nav.innerHTML=order.map(key=>`<button type="button" data-page="${key}"><span>${META[key].icon}</span><b>${META[key].label}</b></button>`).join('');
      nav.querySelectorAll('button').forEach(button=>button.onclick=()=>go(button.dataset.page));
    }
    nav.style.setProperty('--taxi-page-count',String(order.length));
    nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.page===currentPage()));
    return true;
  }

  function addVisibilityControls(){
    const box=byId('taxiPageOrderV24');
    if(!box)return false;
    const label=box.previousElementSibling;
    if(label?.classList.contains('taxi-setting-label-v24'))label.textContent='左右スワイプ・下部ページの順番';
    if(!byId('pageSwipeHelpV47')){
      const help=document.createElement('p');
      help.id='pageSwipeHelpV47';
      help.className='page-swipe-help-v47';
      help.textContent='左で次へ、右で前へ。営業と管理は固定です。';
      box.parentNode.insertBefore(help,box);
    }
    const value=prefs();
    box.querySelectorAll(':scope > div[data-key]').forEach(row=>{
      const key=row.dataset.key;
      row.classList.toggle('page-hidden-v47',!value.visiblePages.includes(key));
      if(row.querySelector('.page-visible-v47'))return;
      const button=document.createElement('button');
      button.type='button';
      button.className='page-visible-v47';
      button.dataset.page=key;
      if(FIXED.has(key)){
        button.textContent='固定';
        button.disabled=true;
      }else{
        button.textContent=value.visiblePages.includes(key)?'表示':'非表示';
        button.onclick=()=>{
          const next=prefs();
          next.visiblePages=next.visiblePages.includes(key)?next.visiblePages.filter(item=>item!==key):[...next.visiblePages,key];
          write(next);
          location.reload();
        };
      }
      const firstArrow=row.querySelector('button[data-dir]');
      row.insertBefore(button,firstArrow||null);
    });
    return true;
  }

  function installSwipe(){
    const host=document.querySelector('main.app');
    if(!host||host.dataset.pageSwipeV47==='1')return false;
    host.dataset.pageSwipeV47='1';
    let tracking=false,startX=0,startY=0,dx=0,dy=0,horizontal=false,lastSwipe=0;
    const blocked=node=>node.closest('input,textarea,select,button,a,dialog,[contenteditable="true"],#taxiGlobalNavV24');
    host.addEventListener('touchstart',event=>{
      if(event.touches.length!==1||blocked(event.target)||document.querySelector('dialog[open]'))return;
      const touch=event.touches[0];
      tracking=true;horizontal=false;dx=dy=0;startX=touch.clientX;startY=touch.clientY;
    },{passive:true});
    host.addEventListener('touchmove',event=>{
      if(!tracking||event.touches.length!==1)return;
      const touch=event.touches[0];dx=touch.clientX-startX;dy=touch.clientY-startY;
      if(!horizontal&&Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)*1.35)horizontal=true;
      if(horizontal)event.preventDefault();
    },{passive:false});
    const finish=()=>{
      if(!tracking)return;
      tracking=false;
      if(!horizontal||Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.35)return;
      const order=enabledOrder();
      const index=order.indexOf(currentPage());
      if(index<0)return;
      const next=dx<0?index+1:index-1;
      if(next>=0&&next<order.length){lastSwipe=Date.now();go(order[next])}
    };
    host.addEventListener('touchend',finish,{passive:true});
    host.addEventListener('touchcancel',()=>{tracking=false},{passive:true});
    host.addEventListener('click',event=>{
      if(Date.now()-lastSwipe<450){event.preventDefault();event.stopPropagation()}
    },true);
    return true;
  }

  const observer=new MutationObserver(()=>{
    applyNav();
    addVisibilityControls();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  applyNav();
  addVisibilityControls();
  installSwipe();
  setInterval(()=>{applyNav();addVisibilityControls();installSwipe()},700);
})();