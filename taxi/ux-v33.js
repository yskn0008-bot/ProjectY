'use strict';
(()=>{
  const params=new URLSearchParams(location.search);
  if(params.get('ux')!=='33'||window.__yosUxV33Loaded)return;
  window.__yosUxV33Loaded=true;

  const ROOT=document.documentElement;
  const APP=document.querySelector('main.app');
  const IS_SETTINGS=location.pathname.endsWith('/taxi/settings.html');
  if(!APP)return;

  const PREF_KEY='yos-taxi-ux-v33';
  const ENTER_KEY='yos-taxi-ux-enter-v33';
  const DEFAULT_MAP={up:'today',right:'week',down:'month',left:'manage'};
  const DIRECTIONS=['up','right','down','left'];
  const OPPOSITE={up:'down',down:'up',left:'right',right:'left'};
  const META={
    drive:{label:'営業',icon:'🚖',hint:'営業コントロール'},
    today:{label:'今日',icon:'◉',hint:'今日の目標と実績'},
    week:{label:'週間',icon:'▦',hint:'7日間の流れ'},
    month:{label:'月間',icon:'▤',hint:'月全体の進捗'},
    manage:{label:'管理',icon:'⚙︎',hint:'目標と設定'}
  };
  const PAGE_KEYS=['today','week','month','manage'];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp=(min,value,max)=>Math.max(min,Math.min(max,value));
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function validMap(value){
    const source=value&&typeof value==='object'?value:{};
    const ordered=[];
    for(const dir of DIRECTIONS){
      const key=source[dir];
      if(PAGE_KEYS.includes(key)&&!ordered.includes(key))ordered.push(key);
    }
    for(const key of PAGE_KEYS)if(!ordered.includes(key))ordered.push(key);
    return Object.fromEntries(DIRECTIONS.map((dir,index)=>[dir,ordered[index]]));
  }

  let prefs={...read(PREF_KEY,{}),map:validMap(read(PREF_KEY,{}).map)};
  const savePrefs=()=>{prefs.map=validMap(prefs.map);write(PREF_KEY,prefs)};

  function currentPage(){
    const path=location.pathname;
    if(path.endsWith('/taxi/')||path.endsWith('/taxi/index.html'))return'drive';
    if(path.endsWith('/taxi/settings.html'))return'manage';
    if(path.endsWith('/taxi/calendar.html')){
      const visible=document.body.dataset.calendarPage;
      if(PAGE_KEYS.includes(visible))return visible;
      const query=params.get('page');
      if(PAGE_KEYS.includes(query))return query;
      return localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
    }
    return'drive';
  }

  function pageUrl(key){
    const url=new URL(key==='drive'?'./':`./calendar.html?page=${key}`,location.href);
    url.searchParams.set('ux','33');
    return url.href;
  }

  function settingsUrl(){
    const url=new URL('./settings.html',location.href);
    url.searchParams.set('ux','33');
    return url.href;
  }

  function setViewport(){
    const vv=window.visualViewport;
    const width=Math.max(320,Math.round(vv?.width||innerWidth));
    const height=Math.max(480,Math.round(vv?.height||innerHeight));
    ROOT.style.setProperty('--ux-vh',`${height}px`);
    ROOT.style.setProperty('--ux-vw',`${width}px`);
    const density=width<=390||height<=700?'compact':width>=430&&height>=850?'large':'standard';
    ROOT.dataset.uxDensity=density;
    ROOT.dataset.uxWidth=String(width);
    ROOT.dataset.uxHeight=String(height);
  }

  ROOT.classList.add('yos-ux-v33');
  document.body.dataset.uxPage=location.pathname.endsWith('/settings.html')?'settings':currentPage();
  APP.dataset.taxiSwipeInstalled='1';
  setViewport();
  window.visualViewport?.addEventListener('resize',setViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',setViewport,{passive:true});
  addEventListener('resize',setViewport,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(setViewport,120),{passive:true});

  function directionForPage(page){
    return DIRECTIONS.find(dir=>prefs.map[dir]===page)||null;
  }

  function targetForGesture(dir){
    const current=currentPage();
    if(current==='drive')return prefs.map[dir]||null;
    const placed=directionForPage(current);
    if(placed&&OPPOSITE[placed]===dir)return'drive';
    return null;
  }

  function preserveTestLinks(){
    document.querySelectorAll('a[href]').forEach(link=>{
      const raw=link.getAttribute('href');
      if(!raw||raw.startsWith('#')||raw.startsWith('javascript:'))return;
      let url;
      try{url=new URL(raw,location.href)}catch{return}
      if(url.origin!==location.origin||!url.pathname.includes('/taxi/'))return;
      url.searchParams.set('ux','33');
      link.href=url.href;
    });

    document.querySelectorAll('#taxiGlobalNavV24 button[data-page]').forEach(button=>{
      button.onclick=event=>{
        event.preventDefault();
        navigate(button.dataset.page,{animate:false});
      };
    });
  }

  function activateCalendar(key){
    if(!location.pathname.endsWith('/taxi/calendar.html')||!PAGE_KEYS.includes(key))return false;
    const button=document.querySelector(`#calendarPagesV21 button[data-page="${key}"]`);
    if(!button)return false;
    button.click();
    const url=new URL(location.href);
    url.searchParams.set('page',key);
    url.searchParams.set('ux','33');
    history.replaceState({},'',url);
    document.body.dataset.uxPage=key;
    document.querySelectorAll('#taxiGlobalNavV24 button').forEach(item=>item.classList.toggle('active',item.dataset.page===key));
    renderDirections();
    return true;
  }

  function navigate(key,{animate=false,enterDir=null}={}){
    if(!META[key])return;
    if(key==='manage'&&location.pathname.endsWith('/taxi/settings.html'))return;
    if(key!=='drive'&&activateCalendar(key))return;
    if(enterDir)sessionStorage.setItem(ENTER_KEY,enterDir);
    location.href=key==='manage'&&currentPage()==='manage'?settingsUrl():pageUrl(key);
  }

  function installDirections(){
    if(document.getElementById('yosUxDirectionsV33'))return;
    const host=document.createElement('div');
    host.id='yosUxDirectionsV33';
    host.setAttribute('aria-hidden','true');
    document.body.appendChild(host);
    renderDirections();
  }

  function renderDirections(){
    const host=document.getElementById('yosUxDirectionsV33');
    if(!host)return;
    if(IS_SETTINGS){host.innerHTML='';return}
    const current=currentPage();
    if(current==='drive'){
      host.innerHTML=DIRECTIONS.map(dir=>{
        const key=prefs.map[dir],meta=META[key];
        const arrow={up:'↑',right:'→',down:'↓',left:'←'}[dir];
        return `<div class="yos-ux-direction-v33" data-dir="${dir}"><span>${arrow}</span><b>${meta.label}</b></div>`;
      }).join('');
      return;
    }
    const placed=directionForPage(current);
    if(!placed){host.innerHTML='';return}
    const back=OPPOSITE[placed],arrow={up:'↑',right:'→',down:'↓',left:'←'}[back];
    host.innerHTML=`<div class="yos-ux-direction-v33" data-dir="${back}"><span>${arrow}</span><b>営業</b></div>`;
  }

  function installScene(){
    if(document.getElementById('yosUxSceneV33'))return;
    const scene=document.createElement('div');
    scene.id='yosUxSceneV33';
    scene.innerHTML='<div id="yosUxPreviewV33"><span></span><b></b><small></small></div>';
    document.body.appendChild(scene);
  }

  installDirections();
  installScene();
  preserveTestLinks();
  setTimeout(preserveTestLinks,250);
  setTimeout(preserveTestLinks,1000);

  const scene=document.getElementById('yosUxSceneV33');
  const preview=document.getElementById('yosUxPreviewV33');
  const previewIcon=preview.querySelector('span');
  const previewTitle=preview.querySelector('b');
  const previewHint=preview.querySelector('small');

  function setPreview(target,progress,dir){
    if(!target){
      scene.style.opacity='0';
      return;
    }
    const meta=META[target];
    previewIcon.textContent=meta.icon;
    previewTitle.textContent=meta.label;
    previewHint.textContent=target==='drive'?'起点へ戻る':meta.hint;
    scene.style.opacity=String(clamp(0,.08+progress*.9,1));
    const offset=20*(1-progress);
    const vector={
      up:[0,offset],
      down:[0,-offset],
      left:[offset,0],
      right:[-offset,0]
    }[dir]||[0,0];
    preview.style.transform=`translate3d(calc(-50% + ${vector[0]}px),calc(-50% + ${vector[1]}px),0) scale(${.94+progress*.06})`;
    preview.style.opacity=String(.68+progress*.32);
  }

  function setAppTransform(dx,dy,progress){
    const scale=1-Math.min(.016,progress*.016);
    APP.style.transform=`translate3d(${dx}px,${dy}px,0) scale(${scale})`;
    APP.style.opacity=String(1-progress*.09);
  }

  function clearAnimation(){
    APP.getAnimations().forEach(animation=>animation.cancel());
    APP.style.transform='translate3d(0,0,0)';
    APP.style.opacity='1';
    scene.style.opacity='0';
    preview.style.transform='translate3d(-50%,-50%,0) scale(.94)';
  }

  function animateApp(from,to,duration,easing,fromOpacity=1,toOpacity=1){
    APP.getAnimations().forEach(animation=>animation.cancel());
    if(reduced||duration<=1){
      APP.style.transform=`translate3d(${to.x}px,${to.y}px,0)`;
      APP.style.opacity=String(toOpacity);
      return Promise.resolve();
    }
    const animation=APP.animate([
      {transform:`translate3d(${from.x}px,${from.y}px,0) scale(${(from.x||from.y)?0.99:1})`,opacity:fromOpacity},
      {transform:`translate3d(${to.x}px,${to.y}px,0) scale(${(to.x||to.y)?0.99:1})`,opacity:toOpacity}
    ],{duration,easing,fill:'forwards'});
    return animation.finished.catch(()=>{});
  }

  let tracking=false,axis='',dir='',target=null,startX=0,startY=0,dx=0,dy=0,frame=0,samples=[],lastGestureAt=0;

  function renderGesture(){
    frame=0;
    const dimension=axis==='x'?Math.max(320,innerWidth):Math.max(480,window.visualViewport?.height||innerHeight);
    const amount=axis==='x'?Math.abs(dx):Math.abs(dy);
    const progress=Math.min(1,amount/(dimension*.48));
    setAppTransform(dx,dy,progress);
    setPreview(target,progress,dir);
  }
  const scheduleRender=()=>{if(!frame)frame=requestAnimationFrame(renderGesture)};

  function blocked(targetNode){
    return !!targetNode.closest('input,textarea,select,dialog[open],[contenteditable="true"],#taxiGlobalNavV24');
  }

  document.addEventListener('touchstart',event=>{
    if(IS_SETTINGS||event.touches.length!==1||document.querySelector('dialog[open]')||blocked(event.target))return;
    const touch=event.touches[0];
    if(touch.clientX<22||touch.clientX>innerWidth-22)return;
    tracking=true;axis='';dir='';target=null;dx=0;dy=0;
    startX=touch.clientX;startY=touch.clientY;
    samples=[{x:startX,y:startY,t:performance.now()}];
    APP.getAnimations().forEach(animation=>animation.cancel());
    APP.style.transition='none';
    scene.style.transition='none';
  },{capture:true,passive:true});

  document.addEventListener('touchmove',event=>{
    if(!tracking||event.touches.length!==1)return;
    const touch=event.touches[0];
    const rawX=touch.clientX-startX;
    const rawY=touch.clientY-startY;
    if(!axis){
      if(Math.hypot(rawX,rawY)<8)return;
      if(Math.abs(rawX)>Math.abs(rawY)*1.14)axis='x';
      else if(Math.abs(rawY)>Math.abs(rawX)*1.14)axis='y';
      else return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    if(axis==='x'){
      dir=rawX<0?'left':'right';
      target=targetForGesture(dir);
      if(target){dx=rawX;dy=rawY*.08}
      else{
        const amount=Math.abs(rawX);
        dx=Math.sign(rawX)*(1-1/(amount*.012+1))*52;
        dy=0;
      }
    }else{
      dir=rawY<0?'up':'down';
      target=targetForGesture(dir);
      if(target){dy=rawY;dx=rawX*.08}
      else{
        const amount=Math.abs(rawY);
        dy=Math.sign(rawY)*(1-1/(amount*.012+1))*52;
        dx=0;
      }
    }
    const now=performance.now();
    samples.push({x:touch.clientX,y:touch.clientY,t:now});
    samples=samples.filter(sample=>now-sample.t<=120);
    scheduleRender();
  },{capture:true,passive:false});

  function velocity(){
    const first=samples[0],last=samples[samples.length-1];
    if(!first||!last||last.t<=first.t)return 0;
    return axis==='x'?(last.x-first.x)/(last.t-first.t):(last.y-first.y)/(last.t-first.t);
  }

  async function cancelGesture(){
    const from={x:dx,y:dy};
    scene.style.transition='opacity 240ms ease';
    scene.style.opacity='0';
    await animateApp(from,{x:0,y:0},reduced?1:320,'cubic-bezier(.18,.86,.24,1.08)',1,1);
    clearAnimation();
  }

  async function commitGesture(){
    const width=Math.max(320,innerWidth);
    const height=Math.max(480,window.visualViewport?.height||innerHeight);
    const end={
      x:dir==='left'?-width*1.04:dir==='right'?width*1.04:0,
      y:dir==='up'?-height*1.04:dir==='down'?height*1.04:0
    };
    setPreview(target,1,dir);
    await animateApp({x:dx,y:dy},end,reduced?1:260,'cubic-bezier(.32,.72,0,1)',1,.84);

    if(target!=='drive'&&activateCalendar(target)){
      const enter={x:-end.x*.18,y:-end.y*.18};
      APP.getAnimations().forEach(animation=>animation.cancel());
      APP.style.transform=`translate3d(${enter.x}px,${enter.y}px,0)`;
      APP.style.opacity='.82';
      requestAnimationFrame(()=>requestAnimationFrame(async()=>{
        await animateApp(enter,{x:0,y:0},reduced?1:360,'cubic-bezier(.17,.89,.32,1.14)',.82,1);
        clearAnimation();
      }));
      return;
    }

    sessionStorage.setItem(ENTER_KEY,OPPOSITE[dir]);
    location.href=pageUrl(target);
  }

  document.addEventListener('touchend',event=>{
    if(!tracking)return;
    tracking=false;
    if(!axis)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    lastGestureAt=Date.now();
    if(frame){cancelAnimationFrame(frame);renderGesture()}
    const speed=Math.abs(velocity());
    const dimension=axis==='x'?Math.max(320,innerWidth):Math.max(480,window.visualViewport?.height||innerHeight);
    const amount=axis==='x'?Math.abs(dx):Math.abs(dy);
    const shouldCommit=target&&(amount>dimension*.22||(speed>.48&&amount>26));
    shouldCommit?commitGesture():cancelGesture();
  },{capture:true,passive:false});

  document.addEventListener('touchcancel',()=>{
    if(!tracking)return;
    tracking=false;
    if(axis)cancelGesture();
  },{capture:true,passive:true});

  document.addEventListener('click',event=>{
    if(Date.now()-lastGestureAt<520){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);

  function installMapSettings(){
    if(!location.pathname.endsWith('/taxi/settings.html')||document.getElementById('yosUxMapV33'))return;
    const wait=setInterval(()=>{
      const panel=document.getElementById('taxiDisplayPanelV24');
      if(!panel)return;
      clearInterval(wait);
      panel.querySelectorAll('.taxi-setting-label-v24').forEach(label=>{
        if(label.textContent.includes('スワイプ・下部ページ'))label.textContent='下部ナビの順番';
      });
      const box=document.createElement('div');
      box.id='yosUxMapV33';
      box.innerHTML=`
        <div class="yos-ux-map-title-v33">十字スワイプ配置</div>
        <div class="yos-ux-cross-v33">
          ${DIRECTIONS.map(dir=>`<div class="yos-ux-slot-v33" data-dir="${dir}"><label>${{up:'上',right:'右',down:'下',left:'左'}[dir]}</label><select aria-label="${dir}方向"></select></div>`).join('')}
          <div class="yos-ux-center-v33"><div><span>🚖</span>営業</div></div>
        </div>
        <button type="button" class="yos-ux-reset-v33">デフォルト配置に戻す</button>`;
      panel.appendChild(box);

      const render=()=>{
        box.querySelectorAll('.yos-ux-slot-v33').forEach(slot=>{
          const dir=slot.dataset.dir;
          const select=slot.querySelector('select');
          select.innerHTML=PAGE_KEYS.map(key=>`<option value="${key}" ${prefs.map[dir]===key?'selected':''}>${META[key].icon} ${META[key].label}</option>`).join('');
          select.onchange=()=>{
            const next=select.value;
            const previous=prefs.map[dir];
            const duplicate=DIRECTIONS.find(other=>other!==dir&&prefs.map[other]===next);
            prefs.map[dir]=next;
            if(duplicate)prefs.map[duplicate]=previous;
            savePrefs();
            render();
            renderDirections();
          };
        });
      };
      box.querySelector('.yos-ux-reset-v33').onclick=()=>{
        prefs.map={...DEFAULT_MAP};
        savePrefs();
        render();
        renderDirections();
      };
      render();
    },60);
    setTimeout(()=>clearInterval(wait),6000);
  }

  installMapSettings();

  const enterDir=sessionStorage.getItem(ENTER_KEY);
  if(enterDir&&DIRECTIONS.includes(enterDir)){
    sessionStorage.removeItem(ENTER_KEY);
    const width=Math.max(320,innerWidth);
    const height=Math.max(480,window.visualViewport?.height||innerHeight);
    const start={
      x:enterDir==='left'?-width*.18:enterDir==='right'?width*.18:0,
      y:enterDir==='up'?-height*.18:enterDir==='down'?height*.18:0
    };
    APP.style.transform=`translate3d(${start.x}px,${start.y}px,0)`;
    APP.style.opacity='.82';
    requestAnimationFrame(()=>requestAnimationFrame(()=>animateApp(start,{x:0,y:0},reduced?1:380,'cubic-bezier(.17,.89,.32,1.12)',.82,1).then(clearAnimation)));
  }

  const observer=new MutationObserver(()=>{
    preserveTestLinks();
    renderDirections();
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-calendar-page']});
})();
