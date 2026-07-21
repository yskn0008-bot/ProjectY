'use strict';
(()=>{
  if(window.__yosTaxiSwipeV30)return;
  window.__yosTaxiSwipeV30=true;

  const PREF_KEY='yos-taxi-ui-v24';
  const ENTER_KEY='yos-taxi-swipe-enter-v30';
  const PAGE_META={
    drive:{label:'営業',icon:'🚖',hint:'営業画面'},
    today:{label:'今日',icon:'◉',hint:'今日の目標と実績'},
    week:{label:'週間',icon:'▦',hint:'7日間の流れ'},
    month:{label:'月間',icon:'▤',hint:'月全体の進捗'},
    manage:{label:'管理',icon:'⚙︎',hint:'目標と設定'}
  };
  const DEFAULT_ORDER=['drive','today','week','month','manage'];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp=(min,value,max)=>Math.max(min,Math.min(max,value));
  const readPrefs=()=>{try{return JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}catch{return{}}};
  const order=()=>{
    const source=Array.isArray(readPrefs().pageOrder)?readPrefs().pageOrder:[];
    const unique=source.filter((key,index)=>PAGE_META[key]&&source.indexOf(key)===index);
    return [...unique,...DEFAULT_ORDER.filter(key=>!unique.includes(key))].slice(0,DEFAULT_ORDER.length);
  };

  const currentPage=()=>{
    const path=location.pathname;
    if(path.endsWith('/taxi/')||path.endsWith('/taxi/index.html'))return'drive';
    if(path.endsWith('/taxi/settings.html'))return'manage';
    if(path.endsWith('/taxi/calendar.html')){
      const visible=document.body.dataset.calendarPage;
      if(['today','week','month','manage'].includes(visible))return visible;
      const query=new URLSearchParams(location.search).get('page');
      if(['today','week','month','manage'].includes(query))return query;
      return localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
    }
    return'drive';
  };
  const pageUrl=key=>key==='drive'?'./':`./calendar.html?page=${key}`;
  const targetFor=direction=>{
    const list=order(),index=list.indexOf(currentPage());
    if(index<0)return null;
    const next=direction==='left'?index+1:index-1;
    return next>=0&&next<list.length?list[next]:null;
  };
  const blocked=target=>target.closest('button,a,input,textarea,select,dialog,[contenteditable="true"],#taxiGlobalNavV24');

  document.documentElement.classList.add('taxi-swipe-v30');
  const app=document.querySelector('main.app');
  if(!app)return;

  const scene=document.createElement('div');
  scene.id='taxiSwipeSceneV30';
  scene.innerHTML='<div class="taxi-swipe-preview-v30"><span></span><b></b><small></small></div>';
  document.body.insertBefore(scene,document.body.firstChild);
  const preview=scene.querySelector('.taxi-swipe-preview-v30');
  const icon=preview.querySelector('span');
  const title=preview.querySelector('b');
  const hint=preview.querySelector('small');

  function setPreview(key,progress,direction){
    if(!key){scene.style.opacity='0';return}
    const meta=PAGE_META[key];
    icon.textContent=meta.icon;title.textContent=meta.label;hint.textContent=meta.hint;
    scene.style.opacity=String(clamp(0,.12+progress*.88,1));
    const offset=(direction==='left'?1:-1)*(1-progress)*22;
    preview.style.transform=`translate3d(calc(-50% + ${offset}px),-50%,0) scale(${.94+progress*.06})`;
    preview.style.opacity=String(.58+progress*.42);
  }

  function setTransform(x,progress){
    const scale=1-Math.min(.014,progress*.014);
    app.style.transform=`translate3d(${x}px,0,0) scale(${scale})`;
    app.style.opacity=String(1-progress*.08);
  }

  function resetStyles(){
    app.getAnimations().forEach(animation=>animation.cancel());
    app.style.transform='translate3d(0,0,0)';
    app.style.opacity='1';
    scene.style.opacity='0';
  }

  function animateApp(fromX,toX,duration,easing,fromOpacity=1,toOpacity=1){
    app.getAnimations().forEach(animation=>animation.cancel());
    const animation=app.animate([
      {transform:`translate3d(${fromX}px,0,0) scale(${fromX?0.99:1})`,opacity:fromOpacity},
      {transform:`translate3d(${toX}px,0,0) scale(${toX?0.99:1})`,opacity:toOpacity}
    ],{duration,easing,fill:'forwards'});
    return animation.finished.catch(()=>{});
  }

  function activateCalendar(key){
    if(!location.pathname.endsWith('/taxi/calendar.html')||key==='drive')return false;
    const button=document.querySelector(`#calendarPagesV21 button[data-page="${key}"]`);
    if(!button)return false;
    button.click();
    const url=new URL(location.href);url.searchParams.set('page',key);history.replaceState({},'',url);
    document.querySelectorAll('#taxiGlobalNavV24 button').forEach(item=>item.classList.toggle('active',item.dataset.page===key));
    return true;
  }

  async function commit(target,direction,x,velocity){
    const width=Math.max(320,innerWidth);
    const sign=direction==='left'?-1:1;
    const distance=Math.max(0,width-Math.abs(x));
    const duration=clamp(170,Math.round(300-distance*Math.min(Math.abs(velocity),1.5)*.12),330);
    scene.style.transition=`opacity ${duration}ms linear`;
    setPreview(target,1,direction);
    await animateApp(x,sign*width*1.04,duration,'cubic-bezier(.32,.72,0,1)',1,.86);

    const enterSign=direction==='left'?1:-1;
    if(activateCalendar(target)){
      app.getAnimations().forEach(animation=>animation.cancel());
      app.style.transform=`translate3d(${enterSign*innerWidth*.18}px,0,0)`;
      app.style.opacity='.82';
      requestAnimationFrame(()=>requestAnimationFrame(async()=>{
        await animateApp(enterSign*innerWidth*.18,0,390,'cubic-bezier(.17,.89,.32,1.16)',.82,1);
        resetStyles();
      }));
      return;
    }

    sessionStorage.setItem(ENTER_KEY,String(enterSign));
    location.href=pageUrl(target);
  }

  function cancel(x){
    scene.style.transition='opacity 260ms ease';
    scene.style.opacity='0';
    animateApp(x,0,360,'cubic-bezier(.17,.89,.32,1.18)',1,1).then(resetStyles);
  }

  function prefetch(){
    const list=order(),index=list.indexOf(currentPage());
    [list[index-1],list[index+1]].filter(Boolean).forEach(key=>{
      const href=pageUrl(key);
      if(document.querySelector(`link[data-taxi-prefetch="${href}"]`))return;
      const link=document.createElement('link');link.rel='prefetch';link.href=href;link.dataset.taxiPrefetch=href;document.head.appendChild(link);
    });
  }

  let tracking=false,horizontal=false,startX=0,startY=0,x=0,target=null,direction='',frame=0,samples=[];
  const render=()=>{frame=0;const progress=Math.min(1,Math.abs(x)/(Math.max(320,innerWidth)*.52));setTransform(x,progress);setPreview(target,progress,direction)};
  const scheduleRender=()=>{if(!frame)frame=requestAnimationFrame(render)};

  document.addEventListener('touchstart',event=>{
    if(event.touches.length!==1||document.querySelector('dialog[open]')||blocked(event.target))return;
    const touch=event.touches[0];
    if(touch.clientX<18||touch.clientX>innerWidth-18)return;
    tracking=true;horizontal=false;startX=touch.clientX;startY=touch.clientY;x=0;target=null;direction='';
    samples=[{x:startX,t:performance.now()}];
    app.getAnimations().forEach(animation=>animation.cancel());
    app.style.transition='none';scene.style.transition='none';
  },{capture:true,passive:true});

  document.addEventListener('touchmove',event=>{
    if(!tracking||event.touches.length!==1)return;
    const touch=event.touches[0],rawX=touch.clientX-startX,rawY=touch.clientY-startY;
    if(!horizontal){
      if(Math.hypot(rawX,rawY)<7)return;
      if(Math.abs(rawX)<=Math.abs(rawY)*1.12){tracking=false;return}
      horizontal=true;
    }
    event.preventDefault();event.stopImmediatePropagation();
    direction=rawX<0?'left':'right';target=targetFor(direction);
    if(target)x=rawX;
    else{
      const amount=Math.abs(rawX);
      x=Math.sign(rawX)*(1-1/(amount*.012+1))*54;
    }
    const now=performance.now();samples.push({x:touch.clientX,t:now});samples=samples.filter(sample=>now-sample.t<=110);
    scheduleRender();
  },{capture:true,passive:false});

  document.addEventListener('touchend',event=>{
    if(!tracking)return;
    tracking=false;
    if(!horizontal)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(frame){cancelAnimationFrame(frame);render()}
    const last=samples[samples.length-1],first=samples[0];
    const velocity=last&&first&&last.t>first.t?(last.x-first.x)/(last.t-first.t):0;
    const width=Math.max(320,innerWidth);
    const shouldCommit=target&&(Math.abs(x)>width*.27||(Math.abs(velocity)>.52&&Math.abs(x)>24));
    if(shouldCommit)commit(target,direction,x,velocity);else cancel(x);
  },{capture:true,passive:false});

  document.addEventListener('touchcancel',()=>{if(!tracking)return;tracking=false;horizontal=false;cancel(x)},{capture:true,passive:true});

  const enter=Number(sessionStorage.getItem(ENTER_KEY)||0);
  if(enter){
    sessionStorage.removeItem(ENTER_KEY);
    app.style.transform=`translate3d(${enter*innerWidth*.2}px,0,0)`;
    app.style.opacity='.8';
    requestAnimationFrame(()=>requestAnimationFrame(()=>animateApp(enter*innerWidth*.2,0,410,'cubic-bezier(.17,.89,.32,1.15)',.8,1).then(resetStyles)));
  }

  prefetch();
})();
