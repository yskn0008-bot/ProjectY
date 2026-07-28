'use strict';
(()=>{
  if(window.__yosPageMotionV48)return;
  window.__yosPageMotionV48=true;
  window.__yosPageSwipeV47=true;

  const KEY='yos-taxi-ui-v24';
  const ENTRY='yos-taxi-page-entry-v48';
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
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function setPageClass(){
    const root=document.documentElement;
    root.classList.add('taxi-shell-v48');
    [...root.classList].filter(name=>name.startsWith('taxi-page-')&&name.endsWith('-v48')).forEach(name=>root.classList.remove(name));
    root.classList.add(`taxi-page-${currentPage()}-v48`);
  }

  function syncViewport(){
    const viewport=window.visualViewport;
    const height=Math.max(320,Math.round(viewport?.height||innerHeight));
    document.documentElement.style.setProperty('--taxi-vh',`${height}px`);
  }

  function pageTarget(direction){
    const order=enabledOrder();
    const index=order.indexOf(currentPage());
    if(index<0)return null;
    const next=direction==='next'?index+1:index-1;
    return next>=0&&next<order.length?order[next]:null;
  }

  function createBackdrop(){
    let backdrop=byId('pageMotionBackdropV48');
    if(backdrop)return backdrop;
    backdrop=document.createElement('div');
    backdrop.id='pageMotionBackdropV48';
    backdrop.setAttribute('aria-hidden','true');
    backdrop.innerHTML='<div><span id="pageMotionIconV48"></span><b id="pageMotionLabelV48"></b></div>';
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function showBackdrop(key,progress,side){
    const backdrop=createBackdrop();
    const meta=META[key];
    if(!meta){backdrop.classList.remove('visible');return}
    byId('pageMotionIconV48').textContent=meta.icon;
    byId('pageMotionLabelV48').textContent=meta.label;
    backdrop.dataset.side=side;
    backdrop.classList.add('visible');
    backdrop.style.opacity=String(Math.min(.92,.18+progress*.74));
    const offset=(side==='right'?1:-1)*(1-progress)*28;
    backdrop.firstElementChild.style.transform=`translate3d(${offset}px,0,0) scale(${.94+progress*.06})`;
  }

  function hideBackdrop(duration=260){
    const backdrop=byId('pageMotionBackdropV48');
    if(!backdrop)return;
    backdrop.style.transitionDuration=`${duration}ms`;
    backdrop.style.opacity='0';
    setTimeout(()=>backdrop.classList.remove('visible'),duration+30);
  }

  function navigate(key,direction,host){
    if(!META[key])return;
    const entry=direction==='next'?'fromRight':'fromLeft';
    sessionStorage.setItem(ENTRY,entry);
    if(reduced||!host){location.href=url(key);return}
    const width=Math.max(innerWidth,320);
    const end=direction==='next'?-width*1.04:width*1.04;
    host.style.transition='transform 300ms cubic-bezier(.22,1,.36,1),opacity 260ms ease,border-radius 300ms ease';
    host.style.transform=`translate3d(${end}px,0,0) scale(.985)`;
    host.style.opacity='.96';
    host.style.borderRadius='26px';
    setTimeout(()=>{location.href=url(key)},220);
  }

  function applyEntry(host){
    const entry=sessionStorage.getItem(ENTRY);
    if(!entry||reduced||!host)return;
    sessionStorage.removeItem(ENTRY);
    const start=entry==='fromRight'?'24%':'-24%';
    host.style.transition='none';
    host.style.transform=`translate3d(${start},0,0) scale(.985)`;
    host.style.opacity='.92';
    host.style.borderRadius='26px';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      host.style.transition='transform 420ms cubic-bezier(.22,1,.36,1),opacity 300ms ease,border-radius 420ms ease';
      host.style.transform='translate3d(0,0,0) scale(1)';
      host.style.opacity='1';
      host.style.borderRadius='0';
      setTimeout(()=>{host.style.transition=''},460);
    }));
  }

  function rubberBand(distance,width){
    const sign=Math.sign(distance)||1;
    const value=Math.abs(distance);
    return sign*width*(1-(1/(value*.55/width+1)))*.42;
  }

  function installMotion(){
    const host=document.querySelector('main.app');
    if(!host||host.dataset.pageMotionV48==='1')return false;
    host.dataset.pageMotionV48='1';
    applyEntry(host);

    let tracking=false,horizontal=false,startX=0,startY=0,dx=0,dy=0,lastX=0,lastAt=0,velocity=0,destination=null,raf=0;
    const blocked=node=>node.closest('input,textarea,select,button,a,dialog,[contenteditable="true"],#taxiGlobalNavV24,[data-no-page-swipe]');

    const paint=()=>{
      raf=0;
      const width=Math.max(innerWidth,320);
      const direction=dx<0?'next':'prev';
      destination=pageTarget(direction);
      const travel=destination?dx:rubberBand(dx,width);
      const progress=Math.min(1,Math.abs(travel)/width);
      host.style.transition='none';
      host.style.transform=`translate3d(${travel}px,0,0) scale(${1-progress*.018})`;
      host.style.opacity=String(1-progress*.08);
      host.style.borderRadius=`${Math.round(progress*26)}px`;
      host.style.boxShadow=`0 18px ${Math.round(30+progress*30)}px rgba(0,0,0,${.16+progress*.18})`;
      if(destination)showBackdrop(destination,progress,dx<0?'right':'left');
      else hideBackdrop(100);
    };

    host.addEventListener('touchstart',event=>{
      if(event.touches.length!==1||blocked(event.target)||document.querySelector('dialog[open]'))return;
      const touch=event.touches[0];
      tracking=true;horizontal=false;dx=dy=velocity=0;destination=null;
      startX=lastX=touch.clientX;startY=touch.clientY;lastAt=performance.now();
      host.style.willChange='transform,opacity,border-radius';
    },{passive:true});

    host.addEventListener('touchmove',event=>{
      if(!tracking||event.touches.length!==1)return;
      const touch=event.touches[0];
      dx=touch.clientX-startX;dy=touch.clientY-startY;
      if(!horizontal){
        if(Math.hypot(dx,dy)<10)return;
        if(Math.abs(dx)<=Math.abs(dy)*1.25){tracking=false;return}
        horizontal=true;
      }
      event.preventDefault();
      const now=performance.now();
      const elapsed=Math.max(1,now-lastAt);
      velocity=(touch.clientX-lastX)/elapsed;
      lastX=touch.clientX;lastAt=now;
      if(!raf)raf=requestAnimationFrame(paint);
    },{passive:false});

    const finish=()=>{
      if(!tracking)return;
      tracking=false;
      if(raf){cancelAnimationFrame(raf);raf=0;paint()}
      if(!horizontal){host.style.willChange='';return}
      const width=Math.max(innerWidth,320);
      const commit=destination&&(Math.abs(dx)>width*.22||(Math.abs(velocity)>.45&&Math.abs(dx)>38));
      if(commit){
        navigate(destination,dx<0?'next':'prev',host);
        return;
      }
      host.style.transition='transform 380ms cubic-bezier(.22,1,.36,1),opacity 260ms ease,border-radius 380ms ease,box-shadow 380ms ease';
      host.style.transform='translate3d(0,0,0) scale(1)';
      host.style.opacity='1';
      host.style.borderRadius='0';
      host.style.boxShadow='none';
      hideBackdrop(240);
      setTimeout(()=>{host.style.transition='';host.style.willChange=''},410);
    };

    host.addEventListener('touchend',finish,{passive:true});
    host.addEventListener('touchcancel',()=>{
      tracking=false;horizontal=false;
      host.style.transition='transform 260ms cubic-bezier(.22,1,.36,1)';
      host.style.transform='translate3d(0,0,0)';
      hideBackdrop(180);
    },{passive:true});
    return true;
  }

  function applyNav(){
    const nav=byId('taxiGlobalNavV24');
    if(!nav)return false;
    const order=enabledOrder();
    const current=[...nav.querySelectorAll('button[data-page]')].map(button=>button.dataset.page);
    if(current.join('|')!==order.join('|')){
      nav.innerHTML=order.map(key=>`<button type="button" data-page="${key}"><span>${META[key].icon}</span><b>${META[key].label}</b></button>`).join('');
    }
    nav.style.setProperty('--taxi-page-count',String(order.length));
    nav.querySelectorAll('button').forEach(button=>{
      button.classList.toggle('active',button.dataset.page===currentPage());
      button.onclick=()=>{
        const pages=enabledOrder();
        const from=pages.indexOf(currentPage());
        const to=pages.indexOf(button.dataset.page);
        navigate(button.dataset.page,to>=from?'next':'prev',document.querySelector('main.app'));
      };
    });
    const height=Math.ceil(nav.getBoundingClientRect().height||68);
    document.documentElement.style.setProperty('--taxi-nav-height',`${height}px`);
    return true;
  }

  function addVisibilityControls(){
    const box=byId('taxiPageOrderV24');
    if(!box)return false;
    const label=box.previousElementSibling;
    if(label?.classList.contains('taxi-setting-label-v24'))label.textContent='左右スワイプ・下部ページの順番';
    if(!byId('pageSwipeHelpV48')){
      const help=document.createElement('p');
      help.id='pageSwipeHelpV48';
      help.className='page-swipe-help-v48';
      help.textContent='左で次へ、右で前へ。営業と管理は固定です。';
      box.parentNode.insertBefore(help,box);
    }
    const value=prefs();
    box.querySelectorAll(':scope > div[data-key]').forEach(row=>{
      const key=row.dataset.key;
      row.classList.toggle('page-hidden-v48',!value.visiblePages.includes(key));
      let button=row.querySelector('.page-visible-v48');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='page-visible-v48';
        button.dataset.page=key;
        const firstArrow=row.querySelector('button[data-dir]');
        row.insertBefore(button,firstArrow||null);
      }
      if(FIXED.has(key)){
        button.textContent='固定';
        button.disabled=true;
        button.onclick=null;
      }else{
        button.disabled=false;
        button.textContent=value.visiblePages.includes(key)?'表示':'非表示';
        button.onclick=()=>{
          const next=prefs();
          next.visiblePages=next.visiblePages.includes(key)?next.visiblePages.filter(item=>item!==key):[...next.visiblePages,key];
          write(next);
          location.reload();
        };
      }
    });
    return true;
  }

  setPageClass();
  syncViewport();
  addEventListener('resize',syncViewport,{passive:true});
  visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  visualViewport?.addEventListener('scroll',syncViewport,{passive:true});

  const observer=new MutationObserver(()=>{
    setPageClass();
    applyNav();
    addVisibilityControls();
    installMotion();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  applyNav();
  addVisibilityControls();
  installMotion();
  setInterval(()=>{setPageClass();applyNav();addVisibilityControls();installMotion()},700);
})();