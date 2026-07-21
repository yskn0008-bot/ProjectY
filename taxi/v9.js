'use strict';
(()=>{
  const CAL='yos-taxi-calendar-v1';
  const APP_URL='https://yskn0008-bot.github.io/ProjectY/taxi/';
  const readCalendar=()=>{try{return JSON.parse(localStorage.getItem(CAL)||'{}')}catch{return{}}};
  const calendarDay=()=>readCalendar().days?.[state.businessDate]||{status:'unknown',target:0,weather:'未確認',factor:1,event:''};

  function getStrategy(){
    const c=calendarDay(),d=new Date(`${state.businessDate}T12:00:00`),w=d.getDay(),busy=w===5||w===6;
    const rain=['雨','強雨','台風'].includes(c.weather),event=String(c.event||'').trim();
    let headline=busy?'那覇へ早めに寄せ、夜需要を取り切る':'宜野湾・浦添で反応を確認し、那覇へ寄せる';
    let reason=`目標 ${money(settings.targetSales||c.target||0)}。空車15分でエリア変更し、空車走行を最短にする。`;
    let early=busy?'配車反応を見ながら那覇へ。18時台から久茂地方面を意識':'宜野湾・浦添で配車反応を確認。弱ければ那覇へ移動';
    let peak='久茂地・松山・若狭。GO・付け待ちを優先し、流し過ぎない';
    let late='松山・若狭・ホテル周辺。1〜3時は待機場所を絞る';
    if(rain){headline='雨需要を拾う。屋根のある乗降地点を優先';reason='ホテル・商業施設・繁華街の出口を狙い、濡れる場所で長時間待たない。'}
    if(event){headline='確認済みイベント需要を軸に組み立てる';reason=`${event}。終了時刻の前後は会場直近を避け、外周で乗車しやすい場所を選ぶ。`}
    if(c.status==='off'){headline='公休。営業せず回復を優先';reason='確認済みの公休日です。休養と次回営業の準備を優先する。'}
    if(state.status!=='before'&&state.status!=='ended')reason+=' 営業中は現在の判断を優先。';
    return{headline,reason,early,peak,late,weather:c.weather||'未確認',event:event||'未確認'};
  }

  function plannedEndAt(){
    const n=new Date(),[sh,sm]=(settings.plannedStart||'17:30').split(':').map(Number),[eh,em]=(settings.plannedEnd||'03:30').split(':').map(Number);
    const start=sh*60+sm,end=eh*60+em,current=n.getHours()*60+n.getMinutes(),d=new Date(n);
    d.setHours(eh,em,0,0);
    if(end<=start&&current>=start)d.setDate(d.getDate()+1);else if(end>start&&d<=n)d.setDate(d.getDate()+1);
    return d;
  }
  function remainingShift(){if(state.status==='ended')return'0:00';const ms=Math.max(0,plannedEndAt()-new Date()),h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return`${h}:${String(m).padStart(2,'0')}`}
  function isoAt(date,clock){if(!date||!clock)return null;const dt=new Date(`${date}T${clock}:00+09:00`);return Number.isNaN(dt.getTime())?null:dt.toISOString()}
  function cleanRestoreUrl(){history.replaceState({},'',location.pathname)}

  function restoreFromUrl(){
    const p=new URLSearchParams(location.search);
    if(p.get('restore')!=='1')return;
    if(state.status!=='before'||state.events.length){cleanRestoreUrl();return}
    const date=p.get('date')||day(),start=p.get('start')||'14:00',drop=p.get('drop')||start;
    const fare=Math.max(0,Number(p.get('fare')||0)),pickup=p.get('pickup')||'未入力',dropoff=p.get('dropoff')||'未入力';
    const currentPlace=p.get('location')||'',apps=p.get('apps')||'',dispatch=p.get('dispatch')||'流し';
    const startIso=isoAt(date,start),dropIso=isoAt(date,drop)||startIso||now();
    const message=`営業状態を復元します。\n開始 ${start}\n売上 ${money(fare)}\n${pickup} → ${dropoff}`;
    if(!confirm(message)){cleanRestoreUrl();return}
    const restored=blank();
    restored.businessDate=date;restored.shiftStart=startIso||now();restored.status='available';restored.availableSince=dropIso;
    restored.events=[
      ...(currentPlace||apps?[{id:`restore-memo-${Date.now()}`,type:'メモ',at:now(),status:'available',memo:[currentPlace&&`現在地：${currentPlace}`,apps&&`配車アプリ：${apps}`].filter(Boolean).join('／')}]:[]),
      ...(fare||pickup!=='未入力'||dropoff!=='未入力'?[{id:`restore-drop-${Date.now()}`,type:'降車',at:dropIso,start:dropIso,end:dropIso,pickup,dropoff,dispatch,fare,payment:'現金',distance:0,tip:0,durationMs:0,waitMs:0,memo:'営業復元：乗車開始時刻は未確認',status:'occupied'}]:[]),
      {id:`restore-start-${Date.now()}`,type:'営業開始',at:restored.shiftStart,status:'before',memo:'営業状態をURLから復元'}
    ];
    state=restored;save();cleanRestoreUrl();
  }

  function injectStyles(){
    if(document.getElementById('quickCssV18'))return;
    const style=document.createElement('style');style.id='quickCssV18';style.textContent=`
      body{overflow-x:hidden}.app{padding:calc(env(safe-area-inset-top) + 8px) 10px calc(env(safe-area-inset-bottom) + 12px)}
      .top{margin-bottom:6px}.top .clock{display:none}.brand-mark-v9{flex:0 0 auto}
      .drive-hero-v10{margin-bottom:8px!important}.quick-dash-v18{border:1px solid rgba(255,179,35,.42);border-radius:22px;padding:12px;background:linear-gradient(145deg,rgba(255,179,35,.13),rgba(16,16,19,.98) 54%);box-shadow:0 14px 35px rgba(0,0,0,.25)}
      .quick-head-v18{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.quick-head-v18 span{font-size:11px;color:#ffd990;font-weight:900}.quick-head-v18 b{display:block;font-size:21px;margin-top:2px}.quick-sales-v18{text-align:right}.quick-sales-v18 strong{display:block;font-size:29px;line-height:1;color:#ffbe3d}.quick-sales-v18 small{font-size:10px;color:var(--muted)}
      .quick-metrics-v18{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.quick-metric-v18{border:1px solid var(--line);border-radius:12px;padding:8px 5px;text-align:center;background:rgba(0,0,0,.18)}.quick-metric-v18 strong{display:block;font-size:15px}.quick-metric-v18 span{font-size:9px;color:var(--muted)}
      .quick-decision-v18{border-left:3px solid var(--blue);border-radius:10px;padding:8px 10px;background:rgba(116,167,255,.09);margin-bottom:9px}.quick-decision-v18 b{display:block;font-size:16px}.quick-decision-v18 small{display:block;color:var(--muted);font-size:10px;margin-top:3px;line-height:1.35}
      .quick-actions-v18{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.quick-actions-v18 .action{min-height:54px;padding:7px 4px;border-radius:14px;font-size:13px}.quick-actions-v18 .action:disabled{display:none}
      .quick-tools-v18{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:7px}.quick-tool-v18{min-height:36px;border:1px solid var(--line);border-radius:11px;background:var(--panel2);color:var(--text);font-size:11px;font-weight:800;text-decoration:none;display:flex;align-items:center;justify-content:center;padding:4px}
      .quick-last-v18{margin-top:7px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .status,.kpis,.imada,#strategyV9,#goalHeroV10,.panel,.danger-link,.footer,.actions-v9{display:none!important}
      #detailDialogV18{max-height:88vh;overflow:auto}#detailDialogV18 .status,#detailDialogV18 .kpis,#detailDialogV18 .imada,#detailDialogV18 #strategyV9,#detailDialogV18 #goalHeroV10,#detailDialogV18 .panel,#detailDialogV18 .danger-link,#detailDialogV18 .footer{display:block!important}#detailDialogV18 .kpis{display:grid!important}#detailDialogV18 .detail-close-v18{position:sticky;top:0;z-index:3;width:100%;min-height:44px;border:0;border-bottom:1px solid var(--line);background:#111114;color:#fff;font-weight:900}
      @media(max-height:700px){.top h1{font-size:20px}.drive-hero-v10{padding:8px!important}.quick-dash-v18{padding:9px}.quick-metrics-v18{margin:7px 0}.quick-actions-v18 .action{min-height:48px}.quick-last-v18{display:none}}
    `;document.head.appendChild(style);
  }

  function setupLegacy(){
    const top=document.querySelector('.top');
    if(top&&!top.querySelector('.brand-mark-v9'))top.insertAdjacentHTML('afterbegin','<div class="brand-mark-v9">Y</div>');
    if(top){top.querySelector('.eyebrow').textContent='NIGHT SHIFT DRIVE';top.querySelector('h1').textContent='YOS Taxi'}
    if(top&&!document.getElementById('driveHeroV10'))top.insertAdjacentHTML('afterend','<section id="driveHeroV10" class="drive-hero-v10"><a class="drive-clock-v10" href="./calendar.html"><span id="driveDateV10">----</span><strong id="driveTimeV10">--:--</strong></a><div class="drive-state-v10"><span class="taxi-glyph-v10">TAXI</span><b id="driveStatusV10">営業前</b><small>残り <span id="driveRemainV10">--:--</span></small></div></section>');
    const status=document.querySelector('.status');
    if(status&&!document.getElementById('progressFillV9'))status.insertAdjacentHTML('beforeend','<div class="progress-v9"><div class="progress-copy-v9"><span>今日の目標進捗</span><strong id="progressTextV9">¥0 / ¥0</strong></div><div class="progress-track-v9"><i id="progressFillV9"></i></div></div>');
    if(status&&!document.getElementById('goalHeroV10'))status.insertAdjacentHTML('afterend','<section id="goalHeroV10" class="goal-hero-v10"><div class="goal-copy-v10"><span>今日の目標金額</span><strong id="goalTargetV10">¥0</strong><i></i><span>現在の売上</span><strong id="goalSalesV10" class="gold-v10">¥0</strong></div><div class="ring-v10" id="goalRingV10"><div><span>達成率</span><strong id="goalRateV10">0%</strong><small>目標まで<br><b id="goalRemainV10">¥0</b></small></div></div><div class="goal-advice-v10"><span>YOSアドバイス</span><b id="goalAdviceV10">営業前に戦略を確認</b></div></section>');
    const actions=document.querySelector('.actions');
    if(actions&&!document.querySelector('.actions-v9')){const wrap=document.createElement('section');wrap.className='actions-v9';const primary=document.createElement('div');primary.className='primary-actions-v9';const secondary=document.createElement('div');secondary.className='secondary-actions-v9';['shiftButton','rideButton','dropoffButton','breakButton'].forEach(id=>primary.appendChild(document.getElementById(id)));['memoButton','shareButton','settingsButton','endButton'].forEach(id=>secondary.appendChild(document.getElementById(id)));wrap.append(primary,secondary);actions.replaceWith(wrap)}
    const imada=document.querySelector('.imada');if(imada){imada.querySelector('h3').textContent='営業中の判断';imada.querySelector('.imada-tag').textContent='IMada × 実営業データ'}
    if(imada&&!document.getElementById('strategyV9'))imada.insertAdjacentHTML('beforebegin','<section id="strategyV9" class="section-card-v9 strategy-v9" aria-live="polite"><div class="section-head-v9"><h3>今日の営業戦略</h3><span class="section-tag-v9">営業前・全体方針</span></div><div id="strategyHeadlineV9" class="strategy-main-v9">営業前に戦略を確認</div><p id="strategyReasonV9" class="strategy-reason-v9"></p><div class="strategy-timeline-v9"><div class="strategy-row-v9"><span>17:30–22:00</span><b id="strategyEarlyV9"></b></div><div class="strategy-row-v9"><span>22:00–00:30</span><b id="strategyPeakV9"></b></div><div class="strategy-row-v9"><span>00:30–03:00</span><b id="strategyLateV9"></b></div></div><div class="strategy-facts-v9"><span id="strategyWeatherV9" class="fact-v9"></span><span id="strategyEventV9" class="fact-v9"></span><span class="fact-v9">空港待機不可</span><span class="fact-v9">基地入構不可</span></div><button id="strategyButtonV9" class="strategy-button-v9">YOSで今日の戦略を最新化</button></section>');
    const strategyButton=document.getElementById('strategyButtonV9');if(strategyButton)strategyButton.onclick=handoffStrategy;
  }

  function setupQuickDashboard(){
    if(document.getElementById('quickDashV18'))return;
    injectStyles();
    const hero=document.getElementById('driveHeroV10')||document.querySelector('.top');
    hero.insertAdjacentHTML('afterend',`<section id="quickDashV18" class="quick-dash-v18" aria-live="polite"><div class="quick-head-v18"><div><span>現在の状態</span><b id="quickStatusV18">営業前</b></div><div class="quick-sales-v18"><strong id="quickSalesV18">¥0</strong><small>現在売上</small></div></div><div class="quick-metrics-v18"><div class="quick-metric-v18"><strong id="quickRidesV18">0</strong><span>乗車</span></div><div class="quick-metric-v18"><strong id="quickIdleV18">0分</strong><span>空車</span></div><div class="quick-metric-v18"><strong id="quickRemainV18">¥0</strong><span>目標まで</span></div><div class="quick-metric-v18"><strong id="quickTimeV18">--:--</strong><span>残り時間</span></div></div><div class="quick-decision-v18"><b id="quickActionV18">営業開始前</b><small id="quickReasonV18">安全確認をして開始</small></div><div id="quickActionsV18" class="quick-actions-v18"></div><div class="quick-tools-v18"><button id="quickDetailV18" class="quick-tool-v18">詳細</button><a class="quick-tool-v18" href="./calendar.html">カレンダー</a><button id="quickYosV18" class="quick-tool-v18">YOS</button><button id="quickUrlV18" class="quick-tool-v18">URLコピー</button></div><div id="quickLastV18" class="quick-last-v18">最新記録：なし</div></section>`);
    const actionBox=document.getElementById('quickActionsV18');
    ['shiftButton','rideButton','dropoffButton','breakButton','memoButton','endButton'].forEach(id=>{const el=document.getElementById(id);if(el)actionBox.appendChild(el)});
    const dialog=document.createElement('dialog');dialog.id='detailDialogV18';dialog.innerHTML='<button class="detail-close-v18">閉じる</button><div class="dialog-body" id="detailBodyV18"></div>';document.body.appendChild(dialog);
    const body=document.getElementById('detailBodyV18');['.status','.kpis','#goalHeroV10','#strategyV9','.imada'].forEach(sel=>{const el=document.querySelector(sel);if(el)body.appendChild(el)});document.querySelectorAll('.panel').forEach(el=>body.appendChild(el));const reset=document.getElementById('resetButton'),footer=document.querySelector('.footer');if(reset)body.appendChild(reset);if(footer)body.appendChild(footer);
    dialog.querySelector('.detail-close-v18').onclick=()=>dialog.close();document.getElementById('quickDetailV18').onclick=()=>dialog.showModal();
    document.getElementById('quickYosV18').onclick=()=>document.getElementById('shareButton').click();
    document.getElementById('quickUrlV18').onclick=async()=>{try{await navigator.clipboard.writeText(APP_URL);alert('アプリURLをコピーしました')}catch{prompt('アプリURL',APP_URL)}};
  }

  function strategyPrompt(){const c=calendarDay();return[`【営業前】今日の営業戦略を最新化して`,`営業日：${state.businessDate}`,`現在地：宜野湾`,`目標：${settings.targetSales||c.target||0}円`,`予定：${settings.plannedStart}〜${settings.plannedEnd}`,`天候：${c.weather||'未確認'}`,`イベント・需要要因：${c.event||'未確認'}`,`制約：基地入構不可・空港待機不可`,`重視：実車率、空車時間、空車走行最小、IMadaメソッド`,`出力：最初のエリア、時間帯別戦略、狙う需要、避ける行動`].join('\n')}
  async function handoffStrategy(){const text=strategyPrompt();try{await navigator.clipboard.writeText(text)}catch{prompt('営業前プロンプトをコピーしてください',text);return}const url=String(settings.yosUrl||'').trim();if(url.startsWith('https://chatgpt.com/')){location.href=url;return}alert('営業前プロンプトをコピーしました。設定でYOSチャットURLを登録してください。');openSettings()}

  function paint(){
    setupLegacy();setupQuickDashboard();
    const n=new Date(),target=Number(settings.targetSales||calendarDay().target||0),current=sales(),remain=Math.max(0,target-current),pct=target?Math.min(100,current/target*100):0,st=getStrategy(),dec=decision(),meta=META[state.status]||META.before;
    const text=document.getElementById('progressTextV9'),fill=document.getElementById('progressFillV9');if(text)text.textContent=`${money(current)} / ${money(target)}`;if(fill)fill.style.width=`${pct}%`;
    const date=document.getElementById('driveDateV10'),clock=document.getElementById('driveTimeV10'),statusText=document.getElementById('driveStatusV10'),remaining=document.getElementById('driveRemainV10');if(date)date.textContent=new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'long'}).format(n);if(clock)clock.textContent=new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false}).format(n);if(statusText)statusText.textContent=meta[0];if(remaining)remaining.textContent=remainingShift();
    const targetEl=document.getElementById('goalTargetV10'),salesEl=document.getElementById('goalSalesV10'),rateEl=document.getElementById('goalRateV10'),remainEl=document.getElementById('goalRemainV10'),ring=document.getElementById('goalRingV10'),advice=document.getElementById('goalAdviceV10');if(targetEl)targetEl.textContent=money(target);if(salesEl)salesEl.textContent=money(current);if(rateEl)rateEl.textContent=`${Math.round(pct)}%`;if(remainEl)remainEl.textContent=money(remain);if(ring)ring.style.setProperty('--pct',`${pct*3.6}deg`);if(advice)advice.textContent=`${dec[0]}｜${dec[1]}`;
    const map={strategyHeadlineV9:st.headline,strategyReasonV9:st.reason,strategyEarlyV9:st.early,strategyPeakV9:st.peak,strategyLateV9:st.late,strategyWeatherV9:`天候：${st.weather}`,strategyEventV9:`イベント：${st.event}`,quickStatusV18:meta[0],quickSalesV18:money(current),quickRidesV18:String(rides().length),quickIdleV18:mins(currentIdleMs()),quickRemainV18:money(remain),quickTimeV18:remainingShift(),quickActionV18:dec[0],quickReasonV18:dec[1]};Object.entries(map).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v});
    const latest=state.events[0],last=document.getElementById('quickLastV18');if(last)last.textContent=latest?`最新記録：${latest.type} ${time(latest.at)} ${desc(latest)}`:'最新記録：なし';
  }

  const oldSummary=summary;summary=function(){const st=getStrategy();return`${oldSummary()}\n今日の営業戦略：${st.headline}`};
  setupLegacy();setupQuickDashboard();restoreFromUrl();paint();setInterval(paint,1000);
})();
