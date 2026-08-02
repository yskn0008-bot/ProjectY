'use strict';
(() => {
const STAGES=['日常世界','冒険への誘い','ためらい','メンターとの出会い','最初の境界線','試練・仲間・敵','最も深い場所へ','最大の試練','報酬','帰路','復活','宝を持って帰還'];
const JOURNEYS_KEY='hj-domain-journeys-v1';
const STORIES_KEY='hj-weekly-stories-v1';
const PROFILE_KEY='hj-user-profile-v1';
const HOME_KEY='yos-home-settings-v2';
const LEGACY_HOME_KEY='yos-home-settings-v1';
const TAXI_KEY='yos-taxi-settings-v2';
const $=(id)=>document.getElementById(id);
const nowIso=()=>new Date().toISOString();
const clean=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
function read(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function journeys(){const value=read(JOURNEYS_KEY,[]);return Array.isArray(value)?value:[]}
function profile(){const value=read(PROFILE_KEY,null);return value&&typeof value==='object'?value:null}
function setStatus(message){const node=$('appStatus');if(node)node.textContent=message}
function stageOptions(selected){return STAGES.map((stage)=>`<option${stage===selected?' selected':''}>${stage}</option>`).join('')}
function domainOptions(selected){
  return journeys().map((journey)=>`<option value="${String(journey.id).replace(/"/g,'&quot;')}"${journey.id===selected?' selected':''}>${journey.icon||'🧭'} ${journey.name}</option>`).join('');
}
function focusedJourney(){
  const items=journeys(),data=profile();
  return items.find((journey)=>journey.id===data?.focusDomain)||items[0]||null;
}
function paintProfile(){
  const data=profile(),focus=focusedJourney();
  if($('heroTitle'))$('heroTitle').textContent=data?.name?`${data.name}の旅は、一つではない。`:'人生は、一つの旅ではない。';
  if($('heroCopy')&&focus)$('heroCopy').textContent=`今いちばん動いているのは「${focus.name}」の旅。現在地は「${focus.stage}」、${focus.cycle||1}周目です。`;
  if($('activeStage')&&focus)$('activeStage').textContent=`${Math.max(1,STAGES.indexOf(focus.stage)+1)}/12`;
}
function openDialog(force=false){
  const items=journeys(),data=profile(),selected=data?.focusDomain||items[0]?.id||'';
  $('profileDomain').innerHTML=domainOptions(selected);
  const focus=items.find((journey)=>journey.id===selected)||items[0];
  $('profileStage').innerHTML=stageOptions(focus?.stage||STAGES[0]);
  $('profileName').value=data?.name==='主人公'?'':data?.name||'';
  $('profileTheme').value=focus?.theme||'';
  $('cancelProfile').hidden=!data&&!force;
  if(!$('onboardingDialog').open)$('onboardingDialog').showModal();
}
function syncDomain(){
  const focus=journeys().find((journey)=>journey.id===$('profileDomain').value);
  if(!focus)return;
  $('profileStage').innerHTML=stageOptions(focus.stage||STAGES[0]);
  $('profileTheme').value=focus.theme||'';
}
function saveProfile(event){
  event.preventDefault();
  const items=journeys(),old=profile(),focusDomain=$('profileDomain').value;
  const focus=items.find((journey)=>journey.id===focusDomain);
  if(focus){
    focus.stage=$('profileStage').value;
    focus.theme=clean($('profileTheme').value);
    focus.updatedAt=nowIso();
  }
  const data={name:clean($('profileName').value,30)||'主人公',focusDomain,createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};
  const ok=write(PROFILE_KEY,data)&&write(JOURNEYS_KEY,items);
  $('onboardingDialog').close();
  paintProfile();
  setStatus(ok?`${data.name}の現在地から旅を始めました。`:'設定を保存できませんでした。');
  location.reload();
}
function currentWeekLabel(){
  const now=new Date(),day=(now.getDay()+6)%7,start=new Date(now),end=new Date(now);
  start.setDate(now.getDate()-day);end.setDate(start.getDate()+6);
  const fmt=(date)=>new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',timeZone:'Asia/Tokyo'}).format(date);
  return `${fmt(start)}〜${fmt(end)}`;
}
function openStory(){
  document.querySelector('[data-tab="story"]')?.click();
  if($('storyPeriod')&&!$('storyPeriod').value)$('storyPeriod').value=currentWeekLabel();
  $('storyPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function sharedYosUrl(){
  const home=read(HOME_KEY,{}),legacy=read(LEGACY_HOME_KEY,{}),taxi=read(TAXI_KEY,{});
  return home.yosUrl||legacy.yosUrl||taxi.yosUrl||'';
}
function buildPrompt(){
  const data=profile(),items=journeys(),stories=read(STORIES_KEY,[]);
  const lines=items.map((journey)=>`- ${journey.name}：${Math.max(1,STAGES.indexOf(journey.stage)+1)}/12「${journey.stage}」・${journey.cycle||1}周目${journey.theme?`・テーマ「${journey.theme}」`:''}`);
  const latest=Array.isArray(stories)?stories[0]:null;
  return['【Hero’s Journey｜現在地相談】',`主人公：${data?.name||'主人公'}`,'','領域ごとの現在地',...lines,'',latest?`直近の物語：${latest.period||'期間未設定'}／${latest.facts}`:'直近の物語：未記録','','複数の旅を一つの順位にまとめず、関係を見てください。','安全と本人の価値観を優先し、今できる小さな一歩を一つ提案してください。','推測は推測と明記し、ステージ判断は本人に確認してください。'].join('\n');
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true}
  catch{
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';
    document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok;
  }
}
async function consultYos(){
  const copied=await copyText(buildPrompt()),url=sharedYosUrl();
  if(url.startsWith('https://chatgpt.com/')){
    setStatus(copied?'現在地をコピーしてYOSを開きます。':'YOSを開きます。');
    location.href=url;return;
  }
  setStatus(copied?'現在地をコピーしました。YOSホームでチャットURLを設定してください。':'相談文をコピーできませんでした。');
}
$('editProfile')?.addEventListener('click',()=>openDialog(true));
$('profileDomain')?.addEventListener('change',syncDomain);
$('onboardingForm')?.addEventListener('submit',saveProfile);
$('cancelProfile')?.addEventListener('click',()=>$('onboardingDialog').close());
$('openStory')?.addEventListener('click',openStory);
$('consultYos')?.addEventListener('click',consultYos);
document.addEventListener('click',(event)=>{if(event.target?.dataset?.role==='save')setTimeout(paintProfile,50)},true);
if($('storyPeriod')&&!$('storyPeriod').value)$('storyPeriod').value=currentWeekLabel();
paintProfile();
if(!profile())openDialog();
})();
