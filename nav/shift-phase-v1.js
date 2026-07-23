'use strict';
(()=>{
  if(window.__yosShiftPhaseV1)return;
  window.__yosShiftPhaseV1=true;

  const style=document.createElement('style');
  style.textContent=`
    .yos-shift-phase{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:15px;background:rgba(23,23,25,.9)}
    .yos-shift-phase__dot{width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 0 5px rgba(66,209,127,.11)}
    .yos-shift-phase b{display:block;font-size:13px}
    .yos-shift-phase small{display:block;margin-top:2px;color:var(--muted);font-size:10px}
    .yos-shift-phase time{color:var(--accent);font-size:15px;font-weight:950}
  `;
  document.head.appendChild(style);

  const sub=document.querySelector('.sub');
  if(!sub)return;

  const section=document.createElement('section');
  section.className='yos-shift-phase';
  section.setAttribute('aria-live','polite');
  section.innerHTML='<i class="yos-shift-phase__dot"></i><div><b>営業準備</b><small>16:00開始に備える</small></div><time>--:--</time>';
  sub.insertAdjacentElement('afterend',section);

  const name=section.querySelector('b');
  const action=section.querySelector('small');
  const clock=section.querySelector('time');
  const phases=[
    {from:16,to:18,name:'立ち上がり',action:'回転優先・最初の実車を早く取る'},
    {from:18,to:22,name:'夜前半',action:'実車率優先・空車時間を短くする'},
    {from:22,to:25,name:'深夜ピーク',action:'長距離機会を逃さず単価を伸ばす'},
    {from:25,to:27,name:'深夜後半',action:'需要の残る場所へ絞って動く'},
    {from:27,to:28,name:'締め',action:'4:00帰庫を守りながら営業する'}
  ];

  const paint=()=>{
    const now=new Date();
    const hour=now.getHours()+now.getMinutes()/60;
    const shiftHour=hour<4?hour+24:hour;
    const phase=phases.find(item=>shiftHour>=item.from&&shiftHour<item.to);
    clock.textContent=now.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
    name.textContent=phase?phase.name:'勤務外';
    action.textContent=phase?phase.action:'勤務時間は16:00〜4:00';
  };
  paint();
  setInterval(paint,30000);
})();