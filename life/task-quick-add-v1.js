'use strict';
(()=>{
  if(window.__yosLifeTaskQuickAddV1)return;
  window.__yosLifeTaskQuickAddV1=true;

  const DATA_KEY='yos-life-v1';
  const clean=(value,max=70)=>String(value||'').trim().slice(0,max);
  const dateKey=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const taskIdentity=value=>clean(value).replace(/\s+/g,' ').toLocaleLowerCase('ja-JP');

  function activeLifeDate(data){
    const key=clean(data?.activeLifeDate,10);
    return key&&data?.days?.[key]&&!data.days[key].lifeFlow?.endedAt?key:dateKey();
  }

  function addTask(data,text){
    if(!data||typeof data!=='object')data={};
    if(!data.days||typeof data.days!=='object')data.days={};
    const value=clean(text);
    if(!value)return{added:false,reason:'empty'};
    const key=activeLifeDate(data);
    const day=data.days[key]&&typeof data.days[key]==='object'?data.days[key]:(data.days[key]={});
    day.tasks=Array.isArray(day.tasks)?day.tasks:[];
    const identity=taskIdentity(value);
    if(day.tasks.some(task=>taskIdentity(task?.text)===identity&&!task?.done))return{added:false,reason:'duplicate',key,text:value};
    day.tasks.push({text:value,done:false,category:'personal'});
    return{added:true,key,text:value};
  }

  window.__yosLifeTaskQuickAddV1Api=Object.freeze({addTask,activeLifeDate});
  if(typeof document==='undefined'||typeof localStorage==='undefined')return;

  const readStore=()=>{try{return JSON.parse(localStorage.getItem(DATA_KEY)||'null')||{days:{}}}catch{return{days:{}}}};
  const saveTask=text=>{
    const data=readStore();
    const result=addTask(data,text);
    if(result.added)localStorage.setItem(DATA_KEY,JSON.stringify(data));
    return result;
  };

  function openForm(button){
    let form=document.getElementById('lifeTaskQuickAddV1');
    if(form){
      form.hidden=false;
      document.getElementById('lifeTaskQuickAddInputV1')?.focus();
      return;
    }
    const sheet=button.closest('.life-task-sheet-v2');
    if(!sheet)return;
    form=document.createElement('form');
    form.id='lifeTaskQuickAddV1';
    form.setAttribute('aria-label','タスクを追加');
    form.style.cssText='display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px 12px 4px;align-items:center';
    form.innerHTML='<input id="lifeTaskQuickAddInputV1" maxlength="70" autocomplete="off" placeholder="今日やること" style="min-width:0;width:100%;box-sizing:border-box;border:1px solid #d8d4c8;border-radius:12px;padding:10px 12px;background:#fffdf7;font:inherit"><button type="submit" style="border:0;border-radius:12px;padding:10px 14px;background:#5f8668;color:white;font-weight:800">追加</button><p id="lifeTaskQuickAddStatusV1" aria-live="polite" style="grid-column:1/-1;margin:0;min-height:1em;font-size:12px;color:#6b746f"></p>';
    const header=sheet.querySelector('header');
    header?.insertAdjacentElement('afterend',form);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const input=document.getElementById('lifeTaskQuickAddInputV1');
      const status=document.getElementById('lifeTaskQuickAddStatusV1');
      const result=saveTask(input?.value||'');
      if(!result.added){
        if(status)status.textContent=result.reason==='duplicate'?'同じ未完了タスクがあります。':'タスクを入力してください。';
        input?.focus();
        return;
      }
      if(status)status.textContent='追加しました。';
      location.reload();
    });
    document.getElementById('lifeTaskQuickAddInputV1')?.focus();
  }

  function bind(){
    const button=document.querySelector('.life-task-sheet-v2 button[aria-label="タスクを追加"]');
    if(!button)return false;
    if(button.dataset.lifeTaskQuickAddV1)return true;
    button.dataset.lifeTaskQuickAddV1='1';
    button.removeAttribute('data-open-page');
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openForm(button);
    },true);
    return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    if(bind()||attempts>=200)clearInterval(timer);
  },50);
  const observer=new MutationObserver(()=>bind());
  observer.observe(document.body,{childList:true,subtree:true});
})();
