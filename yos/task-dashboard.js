'use strict';
(()=>{
  const API='https://project-y-yos-ai.vercel.app';
  const GOOGLE_SCRIPT_URL='https://accounts.google.com/gsi/client';
  const CACHE_KEY='yos-task-dashboard-cache-v1';
  const CACHE_MAX_MS=6*60*60*1000;
  let credential='';
  let initialized=false;
  let authSetupPromise=null;

  function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
  function cleanTitle(value){return String(value||'').replace(/^\d{1,3}\s*[｜|]\s*/u,'').trim()||'名称未設定'}
  function padOrder(value){return String(Number(value)||0).padStart(2,'0')}
  function dueLabel(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(d)}
  function meta(task){const bits=[];const due=dueLabel(task.due);if(due)bits.push(`期限 ${due}`);if(task.state)bits.push(task.state);if(task.owner)bits.push(`担当 ${task.owner}`);return bits}
  function detailLine(label,value){if(!value)return null;const p=el('p');p.append(el('b','',label),document.createTextNode(value));return p}

  function taskRow(task){
    const details=el('details','task-row');const summary=el('summary');summary.append(el('span','task-order',padOrder(task.order)));
    const copy=el('span','task-copy');copy.append(el('b','',cleanTitle(task.title)));const small=el('small');for(const bit of meta(task))small.append(el('span','',bit));copy.append(small);summary.append(copy,el('span','task-state',task.priority||task.state||'Task'));details.append(summary);
    const body=el('div','task-details');for(const line of [detailLine('次の一手',task.nextAction),detailLine('完了条件',task.completion),detailLine('ブロッカー',task.blocker),detailLine('確認済み証拠',task.evidence)])if(line)body.append(line);if(!body.childElementCount)body.append(el('p','task-empty','詳細はまだありません'));details.append(body);return details;
  }

  function groupTasks(tasks){
    const ordered=[...tasks].sort((a,b)=>Number(a.order)-Number(b.order));
    const active=ordered.filter(t=>t.state==='実行中'||t.state==='本人操作');
    return {active,next:ordered.filter(t=>t.state==='次にやる'),waiting:ordered.filter(t=>t.state==='待ち'),hold:ordered.filter(t=>t.state==='保留'),done:ordered.filter(t=>t.state==='完了')};
  }

  function render(data,statusText='最新の状態'){
    const host=document.getElementById('taskDashboardBody');if(!host)return;host.replaceChildren();const groups=groupTasks(Array.isArray(data?.tasks)?data.tasks:[]);
    document.getElementById('taskDashboardStatus').textContent=statusText;
    const activeTitle=el('div','task-section-title');activeTitle.append(el('h3','','今やる'),el('span','',`${groups.active.length}件`));host.append(activeTitle);
    const activeList=el('div','task-list');groups.active.slice(0,3).forEach(t=>activeList.append(taskRow(t)));if(!activeList.childElementCount)activeList.append(el('p','task-empty','今すぐのタスクはありません'));host.append(activeList);
    if(groups.active.length>3)host.append(el('div','task-extra',`ほか ${groups.active.length-3}件`));
    const nextTitle=el('div','task-section-title');nextTitle.append(el('h3','','次'),el('span','',`${groups.next.length}件`));host.append(nextTitle);
    const nextList=el('div','task-list task-next-list');groups.next.slice(0,4).forEach(t=>nextList.append(taskRow(t)));if(!nextList.childElementCount)nextList.append(el('p','task-empty','次のタスクはありません'));host.append(nextList);
    const buckets=el('div','task-buckets');[['待ち',groups.waiting],['保留',groups.hold],['完了',groups.done]].forEach(([label,list])=>{const d=el('details');const s=el('summary');s.append(el('b','',label),el('span','',String(list.length)));d.append(s);const content=el('div','bucket-content');list.forEach(t=>content.append(taskRow(t)));if(!list.length)content.append(el('p','task-empty','ありません'));d.append(content);buckets.append(d)});host.append(buckets);
    const auth=document.getElementById('taskDashboardAuth');if(auth)auth.hidden=true;
  }

  function readCache(){try{const parsed=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!parsed||!Array.isArray(parsed.data?.tasks))return null;return parsed}catch{return null}}
  function writeCache(data){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch{}}

  async function loadTasks(token){
    const response=await fetch(`${API}/api/yos/tasks`,{method:'GET',headers:{Authorization:`Bearer ${token}`,'Accept':'application/json'},cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error(`tasks ${response.status}`);const data=await response.json();if(!Array.isArray(data.tasks))throw new Error('invalid tasks');writeCache(data);render(data,'更新済み');
  }

  async function loadPublicConfig(){const response=await fetch(`${API}/api/yos/public-config`,{headers:{Accept:'application/json'},cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error('config');const config=await response.json();if(typeof config.googleClientId!=='string'||!config.googleClientId.endsWith('.apps.googleusercontent.com'))throw new Error('google client');return config}
  function loadGoogleScript(){return new Promise((resolve,reject)=>{if(globalThis.google?.accounts?.id)return resolve(globalThis.google.accounts.id);const existing=document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);const s=existing||document.createElement('script');const timeout=setTimeout(()=>reject(new Error('google timeout')),15000);const ready=()=>{clearTimeout(timeout);if(globalThis.google?.accounts?.id)resolve(globalThis.google.accounts.id);else reject(new Error('google unavailable'))};s.addEventListener('load',ready,{once:true});s.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('google unavailable'))},{once:true});if(!existing){s.src=GOOGLE_SCRIPT_URL;s.async=true;s.defer=true;s.referrerPolicy='strict-origin-when-cross-origin';s.dataset.yosTasksGoogle='1';document.head.append(s)}})}

  async function setupAuth(){
    if(initialized)return;
    if(authSetupPromise)return authSetupPromise;
    authSetupPromise=Promise.all([loadPublicConfig(),loadGoogleScript()]).then(([config,googleId])=>{
      const host=document.getElementById('taskDashboardGoogleButton');if(!host)throw new Error('google host');
      googleId.initialize({client_id:config.googleClientId,callback:async response=>{credential=String(response?.credential||'').trim();if(!credential){showAuth('Google本人確認に失敗しました。もう一度お試しください。');return}document.getElementById('taskDashboardStatus').textContent='更新中';try{await loadTasks(credential)}catch{showAuth('更新できませんでした。もう一度お試しください。')}},auto_select:false,cancel_on_tap_outside:true,context:'signin',itp_support:true,use_fedcm_for_prompt:true});
      host.replaceChildren();
      googleId.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(320,Math.max(220,Math.floor(host.getBoundingClientRect().width||280)))});
      initialized=true;
    }).catch(()=>{showAuth('Google本人確認を読み込めませんでした。ページを再読み込みしてください。')}).finally(()=>{authSetupPromise=null});
    return authSetupPromise;
  }
  function showAuth(message){const auth=document.getElementById('taskDashboardAuth');if(!auth)return;auth.hidden=false;const p=auth.querySelector('p');if(p)p.textContent=message}

  function install(){
    const home=document.getElementById('homePage');const scene=home?.querySelector('.home-scene');if(!home||!scene||document.getElementById('taskDashboard'))return;
    const dashboard=el('section','task-dashboard');dashboard.id='taskDashboard';const header=el('header');const title=el('div');title.append(el('small','','TODAY'),el('h2','','今どうなってる？'));const status=el('span','task-dashboard-status','読み込み中');status.id='taskDashboardStatus';header.append(title,status);dashboard.append(header);const body=el('div');body.id='taskDashboardBody';body.append(el('p','task-empty','タスクを読み込んでいます'));dashboard.append(body);const auth=el('div','task-auth');auth.id='taskDashboardAuth';auth.hidden=true;auth.append(el('p','','タスクを更新するにはGoogle本人確認が必要です。'));const googleButton=el('div','task-google-button');googleButton.id='taskDashboardGoogleButton';auth.append(googleButton);dashboard.append(auth);scene.before(dashboard);
    const map=el('details','life-map-details');const summary=el('summary','','人生ナビを見る');scene.before(map);map.append(summary,scene);home.classList.add('task-dashboard-ready');
    const cached=readCache();if(cached){const age=Date.now()-Number(cached.savedAt||0);render(cached.data,age<CACHE_MAX_MS?'前回の状態':'更新待ち');if(age>=CACHE_MAX_MS){showAuth('Google本人確認で最新のタスクに更新できます。');setupAuth()}}else{showAuth('最初にGoogle本人確認をすると、現在のタスクが表示されます。');setupAuth()}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
