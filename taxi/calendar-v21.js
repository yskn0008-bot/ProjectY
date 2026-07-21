'use strict';
(()=>{
  if(window.__yosCalendarV21Requested)return;
  window.__yosCalendarV21Requested=true;

  const wait=setInterval(()=>{
    if(typeof render!=='function'||!document.getElementById('calendarV19Styles'))return;
    clearInterval(wait);
    install();
  },60);

  function install(){
    if(window.__yosCalendarV21Loaded)return;
    window.__yosCalendarV21Loaded=true;

    const app=document.querySelector('main.app');
    const oldTabs=document.querySelector('.view-tabs');
    const summary=document.querySelector('.summary');
    const settingsLink=document.querySelector('a.settings');
    const notice=document.querySelector('main.app > .notice');
    if(!app||!oldTabs||!summary)return;

    const tabs=document.createElement('nav');
    tabs.id='calendarPagesV21';
    tabs.className='view-tabs calendar-pages-v21';
    tabs.setAttribute('aria-label','営業カレンダー画面');
    tabs.innerHTML='<button class="view-tab" data-page="today">今日</button><button class="view-tab" data-page="week">週間</button><button class="view-tab" data-page="month">月間</button><button class="view-tab" data-page="manage">管理</button>';
    oldTabs.replaceWith(tabs);

    const manage=document.createElement('section');
    manage.id='manageViewV21';
    manage.className='manage-view-v21';
    manage.innerHTML='<div class="manage-head-v21"><div><span>月次管理</span><b>残額は自動再配分</b></div><small>実績確定後、未営業の勤務日だけ目標が変動</small></div><div class="manage-actions-v21"><a href="./settings.html">営業設定</a><a href="./">営業画面</a></div>';
    manage.insertBefore(summary,manage.querySelector('.manage-actions-v21'));
    app.insertBefore(manage,document.getElementById('dayDialog'));

    if(settingsLink)settingsLink.remove();
    if(notice)notice.remove();

    const css=document.createElement('style');
    css.id='calendarCssV21';
    css.textContent=`
      html,body{height:100%;overflow:hidden}
      body{overscroll-behavior:none}
      .app{height:100svh;min-height:0;overflow:hidden;padding:calc(env(safe-area-inset-top) + 6px) 7px calc(env(safe-area-inset-bottom) + 7px);display:grid;grid-template-rows:auto auto auto minmax(0,1fr);gap:5px}
      .top{margin:0;align-items:center}.top .eyebrow{display:none}.top h1{font-size:19px;white-space:nowrap}.top .back{min-height:34px;padding:0 9px;font-size:10px;border-radius:10px;display:flex;align-items:center}
      .calendar-pages-v21{grid-template-columns:repeat(4,1fr);gap:4px;margin:0}.calendar-pages-v21 .view-tab{min-height:37px;border-radius:10px;font-size:11px}
      .toolbar{grid-template-columns:40px 1fr 40px;margin:0;gap:5px}.toolbar button{min-height:34px;border-radius:10px}.period{font-size:14px}.jump-today{display:none}
      .view,.manage-view-v21{display:none;min-height:0;overflow:hidden}.view.v21-active,.manage-view-v21.v21-active{display:block}
      #todayView.v21-active{display:flex;flex-direction:column;min-height:0}.detail{display:grid;grid-template-rows:auto auto auto auto;gap:5px;min-height:0}.detail-hero{padding:9px 11px;border-radius:14px}.detail-date{font-size:9px}.detail-hero h2{font-size:20px;margin:2px 0}.detail-hero p{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .detail-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.detail-card{padding:7px 4px;border-radius:11px;text-align:center}.detail-card strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.detail-card span{font-size:7px}
      .detail-wide{padding:7px 9px;border-radius:11px}.detail-wide h3{font-size:8px;margin-bottom:2px}.detail-wide p{font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.edit-button{min-height:38px;border-radius:11px;font-size:11px}
      #weekView.v21-active{display:flex;flex-direction:column;min-height:0}.week-summary{grid-template-columns:repeat(4,1fr);gap:4px;margin:0 0 4px}.week-summary .card{padding:6px 3px;border-radius:10px;text-align:center}.week-summary .card strong{font-size:11px}.week-summary .card span{font-size:7px}
      .week-list{flex:1;min-height:0;display:grid;grid-template-rows:repeat(7,minmax(0,1fr));gap:3px}.week-item{min-height:0;padding:4px 7px;border-radius:9px;display:grid;grid-template-columns:1.15fr 1fr;align-items:center;gap:5px}.week-top{min-width:0}.week-date{font-size:11px}.week-item .tag{font-size:7px;padding:2px 5px}.week-metrics{grid-template-columns:1fr 1fr;gap:3px;margin:0}.week-metrics div{font-size:7px}.week-metrics div:nth-child(n+3){display:none}.week-metrics strong{font-size:10px}.week-extra{display:none}
      #monthView.v21-active{display:grid;grid-template-rows:auto auto minmax(0,1fr);min-height:0}.week-start-control{margin:0 0 3px;padding:4px 7px;border-radius:9px}.week-start-control label{font-size:8px}.week-start-control select{min-height:29px;font-size:9px;padding:3px 6px}.legend-v17{margin:0 0 2px;font-size:7px;gap:6px}.week-head div{font-size:8px;padding:2px 0}.month-grid{height:100%;min-height:0;grid-template-rows:repeat(6,minmax(0,1fr));gap:3px}.day{min-height:0!important;padding:4px 3px!important;border-radius:8px}.day::before{left:3px!important;right:3px!important;top:2px!important;height:1px!important}.date{font-size:9px}.month-money{margin-top:8px!important;font-size:9px!important}.month-label,.month-result,.month-sub{font-size:6px!important;margin-top:1px!important}.month-sub{display:none!important}
      .manage-view-v21.v21-active{display:flex;flex-direction:column;min-height:0;gap:6px}.manage-head-v21{border:1px solid rgba(255,179,35,.35);border-radius:14px;padding:10px;background:linear-gradient(145deg,rgba(255,179,35,.12),rgba(21,21,23,.98));display:flex;align-items:flex-end;justify-content:space-between;gap:8px}.manage-head-v21 span{display:block;color:var(--amber);font-size:9px;font-weight:900}.manage-head-v21 b{font-size:17px}.manage-head-v21 small{max-width:45%;color:var(--muted);font-size:8px;line-height:1.3;text-align:right}
      .manage-view-v21 .summary{display:grid!important;grid-template-columns:repeat(4,1fr);gap:5px;margin:0;flex:1;min-height:0}.manage-view-v21 .summary .card{padding:8px 3px;border-radius:11px;text-align:center;display:flex;flex-direction:column;justify-content:center}.manage-view-v21 .summary .card strong{font-size:13px}.manage-view-v21 .summary .card span{font-size:7px}.manage-actions-v21{display:grid;grid-template-columns:1fr 1fr;gap:5px}.manage-actions-v21 a{min-height:39px;border:1px solid var(--line);border-radius:11px;background:var(--panel2);color:var(--text);text-decoration:none;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center}.manage-actions-v21 a:first-child{background:linear-gradient(145deg,var(--amber),#ff7a00);border:0;color:#17100a}
      dialog{overflow:auto}
      @media(max-height:720px){.app{gap:3px}.top h1{font-size:17px}.calendar-pages-v21 .view-tab{min-height:32px}.toolbar button{min-height:30px}.detail-wide{display:none}.detail{grid-template-rows:auto auto auto}.edit-button{min-height:34px}.manage-head-v21{padding:7px 9px}.manage-head-v21 b{font-size:14px}.manage-actions-v21 a{min-height:34px}}
      @media(max-width:370px){.detail-grid{grid-template-columns:repeat(2,1fr)}.detail-card{padding:5px 3px}.manage-view-v21 .summary{grid-template-columns:repeat(2,1fr)}.week-date{font-size:10px}}
    `;
    document.head.appendChild(css);

    let page=localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
    const baseRender=render;

    function paint(){
      document.querySelectorAll('.view').forEach(view=>view.classList.remove('v21-active'));
      manage.classList.remove('v21-active');
      if(page==='manage')manage.classList.add('v21-active');
      else document.getElementById(`${page}View`)?.classList.add('v21-active');
      tabs.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
      document.body.dataset.calendarPage=page;
      if(page==='today')document.getElementById('editToday').textContent='詳細・編集';
    }

    render=function(){
      baseRender();
      if(page!=='manage'&&['today','week','month'].includes(mode))page=mode;
      paint();
    };

    tabs.querySelectorAll('button').forEach(button=>button.onclick=()=>{
      page=button.dataset.page;
      localStorage.setItem('yos-taxi-calendar-page-v21',page);
      if(page==='manage'){
        mode='month';
        baseRender();
        paint();
      }else{
        mode=page;
        render();
      }
    });

    paint();
    render();
  }
})();
