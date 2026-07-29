'use strict';
(()=>{
  if(new URLSearchParams(location.search).get('qa')!=='1')return;
  if(window.__yosTaxiQaV99)return;
  window.__yosTaxiQaV99=true;

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const rect=element=>element?.getBoundingClientRect?.();
  const visible=element=>{
    if(!element)return false;
    const style=getComputedStyle(element);
    const box=rect(element);
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&box.width>0&&box.height>0;
  };
  const round=value=>Math.round(Number(value)||0);
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

  function pageName(){
    if(location.pathname.endsWith('/settings.html'))return'設定';
    if(location.pathname.endsWith('/calendar.html')){
      const page=new URLSearchParams(location.search).get('page')||document.body?.dataset.calendarPage||'today';
      return({today:'今日',week:'週間',month:'月間',manage:'管理'})[page]||page;
    }
    return'営業';
  }

  function importantRoot(){
    const page=pageName();
    if(page==='営業')return $('#quickDashV18')||$('main.app');
    if(page==='今日')return $('#todayView');
    if(page==='週間')return $('#weekView');
    if(page==='月間')return $('#monthView');
    if(page==='管理')return $('#manageViewV21');
    return $('main.app');
  }

  function run(){
    const tests=[];
    const add=(name,status,detail)=>tests.push({name,status,detail});
    const html=document.documentElement;
    const main=$('main.app');
    const nav=$('#taxiGlobalNavV24');
    const root=importantRoot();
    const page=pageName();

    add('表示環境','info',`${standalone?'PWA':'Safari'} / ${innerWidth}×${innerHeight} / DPR ${devicePixelRatio||1}`);
    add('ページ','info',page);

    const horizontal=Math.max(html.scrollWidth,document.body.scrollWidth)-html.clientWidth;
    add('横はみ出し',horizontal<=1?'pass':'fail',`${round(horizontal)}px`);

    const clipped=$$('h1,h2,h3,strong,b,.period,.week-date,.manage-actions-v21 a')
      .filter(visible)
      .filter(element=>element.scrollWidth>element.clientWidth+2)
      .filter(element=>{
        const style=getComputedStyle(element);
        return style.overflow==='hidden'||style.textOverflow==='ellipsis'||style.whiteSpace==='nowrap';
      });
    add('重要文字の切れ',clipped.length===0?'pass':'fail',clipped.length?clipped.slice(0,8).map(element=>String(element.textContent||'').trim()).join(' / '):'なし');

    const controls=$$('button,a,input,select,textarea').filter(visible).filter(element=>!element.closest('#taxiQaV99'));
    const smallControls=controls.filter(element=>{
      const box=rect(element);
      return box.width<44||box.height<44;
    });
    add('タップ領域',smallControls.length===0?'pass':'warn',smallControls.length?`${smallControls.length}件が44px未満`:'すべて44px以上');

    if(nav&&visible(nav)){
      const navBox=rect(nav);
      const overlapTargets=$$('button,a,input,select,textarea,h1,h2,h3,strong,b',main||document)
        .filter(visible)
        .filter(element=>!element.closest('#taxiGlobalNavV24'))
        .filter(element=>{
          const box=rect(element);
          return box.top<navBox.bottom-2&&box.bottom>navBox.top+2&&box.top<innerHeight;
        });
      add('下部ナビ重なり',overlapTargets.length===0?'pass':'fail',overlapTargets.length?overlapTargets.slice(0,8).map(element=>String(element.textContent||element.getAttribute('aria-label')||element.id).trim()).join(' / '):'なし');

      if(root&&visible(root)){
        const gap=navBox.top-rect(root).bottom;
        const status=gap<0?'fail':gap<=18?'pass':gap<=32?'warn':'fail';
        add('本文とメニューバー間隔',status,`${round(gap)}px`);
      }
    }else add('下部ナビ','fail','見つかりません');

    add('スワイプ',main?.getAttribute('data-taxi-swipe-installed')==='1'?'pass':'fail',main?.getAttribute('data-taxi-swipe-installed')==='1'?'導入済み':'未導入');

    if(page==='営業'){
      add('主要操作',$('#quickPrimaryV44 .v44-main')?'pass':'fail',$('#quickPrimaryV44 .v44-main')?.textContent?.trim()||'なし');
      add('YOSナビ入口',$('#quickYosNavV97')?'pass':'fail',$('#quickYosNavV97')?'表示済み':'なし');
      add('営業KPI',$$('.quick-metric-v18').length===4?'pass':'fail',`${$$('.quick-metric-v18').length}枚`);
    }
    if(page==='週間'){
      add('週間集計',$$('.week-summary .card').length===4?'pass':'fail',`${$$('.week-summary .card').length}枚`);
      add('日別カード',$$('#weekView .week-item[data-key]').length===7?'pass':'fail',`${$$('#weekView .week-item[data-key]').length}日`);
    }
    if(page==='月間'){
      const cells=$$('#monthView .month-cell,#monthView [data-key]');
      const unique=[...new Set(cells)];
      add('月カレンダー',unique.length===35||unique.length===42?'pass':'warn',`${unique.length}マス`);
    }
    if(page==='管理'){
      add('月次カード',$$('#manageViewV21 .summary .card').length===8?'pass':'fail',`${$$('#manageViewV21 .summary .card').length}枚`);
      add('管理ボタン',$$('#manageViewV21 .manage-actions-v21 a').length===2?'pass':'fail',`${$$('#manageViewV21 .manage-actions-v21 a').length}個`);
    }
    if(page==='設定'){
      add('勤務時刻',$$('input[type="time"]').length>=3?'pass':'fail',`${$$('input[type="time"]').length}項目`);
      add('保存ボタン',$('#save')?'pass':'fail',$('#save')?'あり':'なし');
    }

    const failures=tests.filter(test=>test.status==='fail').length;
    const warnings=tests.filter(test=>test.status==='warn').length;
    return{tests,failures,warnings,page,standalone,viewport:`${innerWidth}×${innerHeight}`,url:location.href,time:new Date().toISOString()};
  }

  function show(report){
    document.getElementById('taxiQaV99')?.remove();
    const overlay=document.createElement('section');
    overlay.id='taxiQaV99';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-label','Taxi実機QA結果');
    overlay.innerHTML=`
      <style>
        #taxiQaV99{position:fixed;z-index:2147483647;inset:calc(env(safe-area-inset-top) + 8px) 8px calc(env(safe-area-inset-bottom) + 8px);overflow:auto;padding:14px;border:1px solid #3b3c43;border-radius:20px;background:rgba(10,10,13,.97);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.65);-webkit-overflow-scrolling:touch}
        #taxiQaV99 *{box-sizing:border-box}#taxiQaV99 header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}#taxiQaV99 h2{margin:0;font-size:22px}#taxiQaV99 p{margin:3px 0 0;color:#b8b8c1;font-size:11px}#taxiQaV99 .qa-score{font-size:18px;font-weight:950;color:${report.failures?'#ff7d86':report.warnings?'#ffd17a':'#6dde91'}}#taxiQaV99 .qa-list{display:grid;gap:7px}#taxiQaV99 .qa-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;padding:9px;border:1px solid #303138;border-radius:13px;background:#17181b}#taxiQaV99 .qa-icon{font-size:18px;text-align:center}#taxiQaV99 b{display:block;font-size:13px}#taxiQaV99 small{display:block;margin-top:3px;color:#b8b8c1;font-size:11px;line-height:1.35;overflow-wrap:anywhere}#taxiQaV99 .qa-actions{position:sticky;bottom:-14px;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px -14px -14px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(10,10,13,.96);border-top:1px solid #303138}#taxiQaV99 button{min-height:48px;border:1px solid #3b3c43;border-radius:14px;background:#222329;color:#fff;font-size:15px;font-weight:950}#taxiQaV99 button:first-child{background:linear-gradient(145deg,#ffb323,#ff7a00);border:0;color:#17100a}
      </style>
      <header><div><h2>Taxi実機QA</h2><p>${report.page}・${report.standalone?'PWA':'Safari'}・${report.viewport}</p></div><div class="qa-score">失敗 ${report.failures}<br>注意 ${report.warnings}</div></header>
      <div class="qa-list">${report.tests.map(test=>`<div class="qa-row"><div class="qa-icon">${test.status==='pass'?'✅':test.status==='fail'?'❌':test.status==='warn'?'⚠️':'ℹ️'}</div><div><b>${test.name}</b><small>${test.detail}</small></div></div>`).join('')}</div>
      <div class="qa-actions"><button id="taxiQaCopyV99">結果をコピー</button><button id="taxiQaCloseV99">閉じる</button></div>`;
    document.body.appendChild(overlay);
    $('#taxiQaCloseV99',overlay).onclick=()=>overlay.remove();
    $('#taxiQaCopyV99',overlay).onclick=async()=>{
      const text=JSON.stringify(report,null,2);
      try{await navigator.clipboard.writeText(text);alert('QA結果をコピーしました。')}catch{prompt('QA結果',text)}
    };
  }

  const start=()=>setTimeout(()=>show(run()),1200);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();