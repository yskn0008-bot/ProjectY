'use strict';
(()=>{
  if(window.__yosDriveV44Loaded)return;
  window.__yosDriveV44Loaded=true;

  const LAST_DISPATCH='yos-taxi-last-dispatch-v44';
  const byId=id=>document.getElementById(id);

  function installFareGuard(){
    const confirmButton=byId('confirmDropoff');
    const fare=byId('fare');
    if(!confirmButton||!fare||confirmButton.dataset.fareGuardV44)return;
    confirmButton.addEventListener('click',event=>{
      const raw=String(fare.value||'').trim();
      const amount=Number(raw);
      if(raw===''||!Number.isFinite(amount)||amount<=0){
        event.preventDefault();
        event.stopImmediatePropagation();
        alert('運賃を入力してください。');
        fare.focus();
      }
    },true);
    confirmButton.dataset.fareGuardV44='1';
  }

  function simplifyForms(){
    const payment=byId('payment');
    if(payment&&!payment.dataset.v44){
      const previous=payment.value;
      const options=['現金','GO決済','DiDiアプリ決済','電脳ネット決済','チケット・クーポン','Uberアプリ決済','未収金','障害者割引','その他'];
      payment.innerHTML=options.map(value=>`<option>${value}</option>`).join('');
      payment.value=options.includes(previous)?previous:'現金';
      payment.dataset.v44='1';
    }

    const dispatch=byId('dispatch');
    if(dispatch&&!dispatch.dataset.v44){
      const saved=localStorage.getItem(LAST_DISPATCH);
      if(saved&&[...dispatch.options].some(option=>option.value===saved))dispatch.value=saved;
      dispatch.addEventListener('change',()=>localStorage.setItem(LAST_DISPATCH,dispatch.value));
      dispatch.dataset.v44='1';
    }

    const dropDialog=byId('dropoffDialog');
    const distance=byId('distance');
    const dropMemo=byId('dropMemo');
    if(dropDialog&&distance&&dropMemo&&!byId('dropExtraV44')){
      const details=document.createElement('details');
      details.id='dropExtraV44';
      details.className='optional-v44';
      details.innerHTML='<summary>距離・チップ・メモを追加</summary><div class="optional-body-v44"></div>';
      const body=details.querySelector('.optional-body-v44');
      const distanceRow=distance.closest('.row2');
      const memoField=dropMemo.closest('.field');
      distanceRow?.parentNode?.insertBefore(details,distanceRow);
      if(distanceRow)body.appendChild(distanceRow);
      if(memoField)body.appendChild(memoField);
    }

    const rideMemo=byId('rideMemo');
    if(rideMemo&&!byId('rideExtraV44')){
      const field=rideMemo.closest('.field');
      if(field){
        const details=document.createElement('details');
        details.id='rideExtraV44';
        details.className='optional-v44';
        details.innerHTML='<summary>メモを追加</summary><div class="optional-body-v44"></div>';
        field.parentNode.insertBefore(details,field);
        details.querySelector('.optional-body-v44').appendChild(field);
      }
    }

    const dropoffButton=byId('dropoffButton');
    if(dropoffButton&&!dropoffButton.dataset.focusV44){
      dropoffButton.addEventListener('click',()=>setTimeout(()=>byId('fare')?.focus(),450));
      dropoffButton.dataset.focusV44='1';
    }
    installFareGuard();
  }

  function undoLast(){
    const latest=state?.events?.[0];
    if(!latest){alert('取り消せる記録はありません。');return}
    if(!confirm(`最後の「${latest.type}」を取り消しますか？`))return;
    state.events.shift();
    switch(latest.type){
      case '営業開始':
        state=blank();
        break;
      case '乗車':
        state.activeRide=null;
        state.status='available';
        state.availableSince=latest.at||now();
        break;
      case '降車':
        state.activeRide={
          start:latest.start||latest.at,
          pickup:latest.pickup||'',
          pickupCoords:latest.pickupCoords||'',
          dispatch:latest.dispatch||'流し',
          memo:latest.memo||'',
          waitMs:Number(latest.waitMs||0)
        };
        state.status='occupied';
        state.availableSince=null;
        break;
      case '休憩開始':
        state.breakStart=null;
        state.status='available';
        state.availableSince=latest.at||now();
        break;
      case '休憩終了':
        state.breakStart=latest.start||latest.at||now();
        state.status='break';
        state.availableSince=null;
        break;
      case '営業終了':
        state.shiftEnd=null;
        state.status='available';
        state.availableSince=latest.at||now();
        break;
      default:
        break;
    }
    save();
  }

  function setup(){
    const dash=byId('quickDashV18');
    const oldBox=byId('quickActionsV18');
    if(!dash||!oldBox)return false;
    dash.classList.add('drive-v44');

    const refs={};
    ['shiftButton','rideButton','dropoffButton','breakButton','memoButton','shareButton','settingsButton','endButton'].forEach(id=>refs[id]=byId(id));

    oldBox.className='quick-actions-v44';
    const primary=document.createElement('div');
    primary.id='quickPrimaryV44';
    primary.className='quick-primary-v44';
    const secondary=document.createElement('div');
    secondary.id='quickSecondaryV44';
    secondary.className='quick-secondary-v44';
    oldBox.replaceChildren(primary,secondary);
    Object.values(refs).forEach(button=>{
      if(!button)return;
      button.classList.remove('v44-main');
      secondary.appendChild(button);
    });

    const urlButton=byId('quickUrlV18');
    if(urlButton){
      urlButton.textContent='設定';
      urlButton.onclick=()=>byId('settingsButton')?.click();
    }
    const yosButton=byId('quickYosV18');
    if(yosButton)yosButton.textContent='YOSへ送る';

    const tools=dash.querySelector('.quick-tools-v18');
    if(tools&&!byId('quickUndoV44')){
      const undo=document.createElement('button');
      undo.id='quickUndoV44';
      undo.className='quick-tool-v18 undo-v44';
      undo.textContent='1つ戻す';
      undo.onclick=undoLast;
      tools.insertBefore(undo,tools.lastElementChild);
    }

    simplifyForms();
    sync();
    return true;
  }

  function move(button,parent,main=false){
    if(!button||!parent)return;
    if(button.parentNode!==parent)parent.appendChild(button);
    button.hidden=false;
    if(main)button.disabled=false;
    button.classList.toggle('v44-main',main);
  }

  function sync(){
    const dash=byId('quickDashV18');
    const primary=byId('quickPrimaryV44');
    const secondary=byId('quickSecondaryV44');
    if(!dash||!primary||!secondary)return;

    const buttons={
      shift:byId('shiftButton'),ride:byId('rideButton'),dropoff:byId('dropoffButton'),
      break:byId('breakButton'),memo:byId('memoButton'),share:byId('shareButton'),
      settings:byId('settingsButton'),end:byId('endButton')
    };
    dash.dataset.state=state.status;

    const primaryMap={before:buttons.shift,available:buttons.ride,occupied:buttons.dropoff,break:buttons.break,ended:buttons.share};
    const main=primaryMap[state.status]||buttons.shift;
    move(main,primary,true);

    const secondaryMap={
      before:[buttons.memo],
      available:[buttons.break,buttons.memo,buttons.end],
      occupied:[buttons.memo],
      break:[buttons.memo],
      ended:[]
    };
    const allowed=new Set(secondaryMap[state.status]||[]);
    (secondaryMap[state.status]||[]).forEach(button=>move(button,secondary,false));

    Object.values(buttons).forEach(button=>{
      if(!button||button===main||allowed.has(button))return;
      button.classList.remove('v44-main');
      const legacy=document.querySelector('.actions-v9 .secondary-actions-v9')||document.querySelector('.actions-v9');
      if(legacy&&button.parentNode!==legacy)legacy.appendChild(button);
    });
    secondary.hidden=secondary.children.length===0;
  }

  let attempts=0;
  const wait=setInterval(()=>{
    attempts++;
    if(setup()||attempts>80)clearInterval(wait);
  },100);
  setInterval(()=>{simplifyForms();sync()},700);
})();
