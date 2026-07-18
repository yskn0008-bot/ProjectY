'use strict';
(()=>{
  const path=location.pathname;
  const isSettings=path.endsWith('/settings.html');
  const isCalendar=path.endsWith('/calendar.html');
  const isOperations=path.endsWith('/taxi/')||path.endsWith('/taxi/index.html');
  const CAL='yos-taxi-calendar-v1',SET='yos-taxi-calendar-settings-v2';
  const defaultFactors=[1.0,0.9,0.9,0.9,1.0,1.2,1.3];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const pad=n=>String(n).padStart(2,'0');
  const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayKey=()=>{const d=new Date();if(d.getHours()<8)d.setDate(d.getDate()-1);return dateKey(d)};
  const isWork=status=>status==='work'||status==='transferWork';

  function tidyHeader(){
    const h1=document.querySelector('.top h1');
    const back=document.querySelector('.top .back');
    if(isSettings&&h1){h1.textContent='営業設定';document.title='YOS Taxi 営業設定'}
    if(isCalendar&&h1)h1.textContent='営業カレンダー';
    if(back&&(isSettings||isCalendar))back.textContent='営業';
    if(isOperations&&h1)h1.setAttribute('title',h1.textContent.trim());
  }

  function options(value){
    return [0.8,0.9,1,1.1,1.2,1.3,1.4].map(v=>`<option value="${v}" ${Number(value)===v?'selected':''}>×${v.toFixed(1)}</option>`).join('');
  }

  function persistWeekdayFactors(){
    const cfg=read(SET,{});
    const factors=[...document.querySelectorAll('[data-weekday-factor]')].map(select=>Number(select.value||1));
    if(factors.length===7){cfg.weekdayFactors=factors;cfg.factor=1;write(SET,cfg)}
  }

  function addWeekdayFactors(){
    const panel=[...document.querySelectorAll('.panel')].find(el=>el.querySelector('h2')?.textContent.includes('目標配分'));
    if(!panel||document.getElementById('weekdayFactorPanel'))return;
    const cfg=read(SET,{}),factors=Array.isArray(cfg.weekdayFactors)&&cfg.weekdayFactors.length===7?cfg.weekdayFactors:defaultFactors;
    const oldFactor=document.getElementById('factor')?.closest('.field');
    if(oldFactor)oldFactor.classList.add('v14-hidden');
    const round=document.getElementById('round');
    if(round){
      const field=round.closest('.field');
      const label=field?.querySelector('label');
      if(label)label.textContent='目標金額の調整単位';
      if(field&&!field.querySelector('.round-help'))field.insertAdjacentHTML('beforeend','<small class="round-help">自動計算した目標を、この単位で切り上げます。例：36,247円を500円単位にすると36,500円です。</small>');
    }
    const names=['日','月','火','水','木','金','土'];
    const box=document.createElement('div');
    box.id='weekdayFactorPanel';
    box.className='weekday-factor-panel';
    box.innerHTML=`<h3>曜日ごとの期待値</h3><p>1.0が基準。金曜・土曜だけ高くするなど、曜日ごとに設定できます。雨・イベントなど当日だけの補正は、営業カレンダーの日別編集で追加します。</p><div class="weekday-grid">${names.map((name,i)=>`<div class="weekday-factor"><label>${name}曜</label><select data-weekday-factor="${i}">${options(factors[i])}</select></div>`).join('')}</div>`;
    const firstFields=panel.querySelector('.fields');
    if(firstFields)firstFields.insertAdjacentElement('afterbegin',box);else panel.appendChild(box);
    box.querySelectorAll('select').forEach(select=>select.addEventListener('change',persistWeekdayFactors));
  }

  function replaceAllocate(){
    const original=document.getElementById('allocate');
    if(!original||original.dataset.v14==='1')return;
    const button=original.cloneNode(true);
    button.dataset.v14='1';
    original.replaceWith(button);
    button.addEventListener('click',()=>{
      persistWeekdayFactors();
      const data=read(CAL,{monthlyGoals:{},days:{}}),cfg=read(SET,{}),month=document.getElementById('month')?.value;
      if(!month){alert('設定する月を確認してください');return}
      const goal=Number(document.getElementById('goal')?.value||data.monthlyGoals?.[month]||0);
      const factors=Array.isArray(cfg.weekdayFactors)&&cfg.weekdayFactors.length===7?cfg.weekdayFactors:defaultFactors;
      const carry=Number(document.getElementById('carrySales')?.value||cfg.carrySales||0);
      const round=Number(document.getElementById('round')?.value||cfg.round||500);
      const start=document.getElementById('start')?.value||cfg.shiftStart||'17:30';
      const end=document.getElementById('end')?.value||cfg.shiftEnd||'03:30';
      const toMinutes=v=>{const [h,m]=String(v).split(':').map(Number);return h*60+m};
      const a=toMinutes(start),b=toMinutes(end),standard=Math.max(((b<=a?b+1440:b)-a)/60,1);
      const all=Object.entries(data.days||{}).filter(([key])=>key.startsWith(month));
      const achieved=all.reduce((sum,[,value])=>sum+Number(value.sales||0),carry);
      const remaining=Math.max(0,goal-achieved),today=todayKey();
      const workdays=all.filter(([key,value])=>key>=today&&isWork(value.status));
      if(!workdays.length){alert('残り勤務日がありません。先に勤務予定を設定してください。');return}
      const weighted=workdays.map(([key,value])=>{
        const weekday=new Date(`${key}T12:00:00`).getDay();
        const planned=Number(value.plannedHours??value.hours??standard);
        const dayFactor=Number(value.factor||1);
        return [key,Number(factors[weekday]||1)*Math.max(.25,planned/standard)*dayFactor];
      });
      const total=weighted.reduce((sum,[,weight])=>sum+weight,0);
      weighted.forEach(([key,weight])=>{
        const raw=total?remaining*weight/total:0;
        data.days[key]={...data.days[key],target:Math.ceil(raw/round)*round};
      });
      data.monthlyGoals=data.monthlyGoals||{};data.monthlyGoals[month]=goal;write(CAL,data);
      const nextCfg={...cfg,weekdayFactors:factors,round,carrySales:carry,factor:1};write(SET,nextCfg);
      try{if(typeof renderStats==='function')renderStats()}catch{}
      alert('曜日ごとの期待値を使って、残り勤務日へ目標を配分しました');
    });
  }

  tidyHeader();
  if(isSettings){
    addWeekdayFactors();
    replaceAllocate();
    document.getElementById('save')?.addEventListener('click',persistWeekdayFactors,true);
    document.getElementById('generate')?.addEventListener('click',persistWeekdayFactors,true);
  }
})();
