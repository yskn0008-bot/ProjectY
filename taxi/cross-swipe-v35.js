'use strict';
(()=>{
  if(window.__yosCrossSwipeV35)return;
  window.__yosCrossSwipeV35=true;
  const app=document.querySelector('main.app');
  if(!app)return;
  app.dataset.taxiSwipeInstalled='1';
  const MAP={up:'today',right:'week',down:'month',left:'manage'};
  const OPP={up:'down',down:'up',left:'right',right:'left'};
  const dirs=['up','right','down','left'];
  const labels={today:'今日',week:'週間',month:'月間',manage:'管理',drive:'営業'};
  const arrows={up:'↑',right:'→',down:'↓',left:'←'};
  const page=()=>{
    const p=location.pathname;
    if(p.endsWith('/taxi/')||p.endsWith('/taxi/index.html'))return'drive';
    if(p.endsWith('/taxi/settings.html'))return'manage';
    const q=new URLSearchParams(location.search).get('page');
    if(['today','week','month','manage'].includes(q))return q;
    return document.body.dataset.calendarPage||localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
  };
  const placed=k=>dirs.find(d=>MAP[d]===k);
  const target=d=>{
    const cur=page();
    if(cur==='drive')return MAP[d];
    const back=OPP[placed(cur)];
    if(d===back)return'drive';
    const next=MAP[d];
    return next===cur?null:next;
  };
  const url=k=>k==='drive'?'./index.html':`./calendar.html?page=${k}`;
  const go=k=>{if(k)location.href=url(k)};
  const guide=document.createElement('div');
  guide.id='crossSwipeGuideV35';
  document.body.appendChild(guide);
  const renderGuide=()=>{
    const cur=page();
    guide.innerHTML=dirs.map(d=>{
      const dest=target(d);
      return dest?`<span data-dir="${d}">${arrows[d]} ${labels[dest]}</span>`:'';
    }).join('');
  };
  renderGuide();
  let active=false,sx=0,sy=0,dx=0,dy=0,axis='',dir='',dest=null;
  const blocked=n=>n.closest('input,textarea,select,button,a,dialog,[contenteditable="true"],#taxiGlobalNavV24');
  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1||blocked(e.target)||document.querySelector('dialog[open]'))return;
    const t=e.touches[0];
    if(t.clientX<18||t.clientX>innerWidth-18)return;
    active=true;sx=t.clientX;sy=t.clientY;dx=dy=0;axis=dir='';dest=null;
    app.style.transition='none';
  },{capture:true,passive:true});
  document.addEventListener('touchmove',e=>{
    if(!active||e.touches.length!==1)return;
    const t=e.touches[0];dx=t.clientX-sx;dy=t.clientY-sy;
    if(!axis){if(Math.hypot(dx,dy)<10)return;axis=Math.abs(dx)>Math.abs(dy)*1.15?'x':Math.abs(dy)>Math.abs(dx)*1.15?'y':'';if(!axis)return}
    e.preventDefault();e.stopImmediatePropagation();
    dir=axis==='x'?(dx<0?'left':'right'):(dy<0?'up':'down');
    dest=target(dir);
    const x=axis==='x'?(dest?dx:Math.sign(dx)*Math.min(42,Math.abs(dx)*.18)):0;
    const y=axis==='y'?(dest?dy:Math.sign(dy)*Math.min(42,Math.abs(dy)*.18)):0;
    app.style.transform=`translate3d(${x}px,${y}px,0)`;
    app.style.opacity=dest?String(Math.max(.72,1-(Math.abs(x)+Math.abs(y))/1200)):'1';
  },{capture:true,passive:false});
  const finish=()=>{
    if(!active)return;active=false;
    const distance=axis==='x'?Math.abs(dx):Math.abs(dy);
    const threshold=(axis==='x'?innerWidth:(visualViewport?.height||innerHeight))*.18;
    app.style.transition='transform .18s ease,opacity .18s ease';
    app.style.transform='translate3d(0,0,0)';app.style.opacity='1';
    if(dest&&distance>Math.max(52,threshold))setTimeout(()=>go(dest),90);
  };
  document.addEventListener('touchend',finish,{capture:true,passive:true});
  document.addEventListener('touchcancel',finish,{capture:true,passive:true});
})();