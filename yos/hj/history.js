"use strict";
(()=>{const S=["日常世界","冒険への誘い","ためらい","メンターとの出会い","最初の境界線","試練・仲間・敵","最も深い場所へ","最大の試練","報酬","帰路","復活","宝を持って帰還"],A=Array.isArray(globalThis.HJ_ARCHETYPES)?globalThis.HJ_ARCHETYPES:[],AM=new Map(A.map(v=>[v.id,v.name])),K={j:"hj-domain-journeys-v1",p:"hj-user-profile-v1",s:"hj-daily-scenes-v1",h:"hj-stage-history-v1",x:"hj-stage-snapshot-v1",f:"hj-user-preferences-v1",home:"yos-home-settings-v2",legacy:"yos-home-settings-v1",taxi:"yos-taxi-settings-v2"},$=id=>document.getElementById(id),read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||"null")??d}catch{return d}},write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}},clean=(v,n=160)=>typeof v==="string"?v.trim().slice(0,n):"",esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]),uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,js=()=>{const v=read(K.j,[]);return Array.isArray(v)?v:[]},hs=()=>{const v=read(K.h,[]);return Array.isArray(v)?v:[]},snap=(a=js())=>Object.fromEntries(a.map(j=>[j.id,{name:clean(j.name,24),stage:S.includes(j.stage)?j.stage:S[0],cycle:Math.max(1,Math.min(99,+j.cycle||1)),theme:clean(j.theme),stageUnknown:Boolean(j.stageUnknown)}])),status=m=>{$("appStatus")&&($("appStatus").textContent=m)},fmt=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"日時不明":new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Tokyo"}).format(d)};
function render(){const b=$("spiralHistory");if(!b)return;const a=hs().slice(0,16);b.innerHTML="";a.forEach((e,i)=>{const m=e.type==="start"?`旅を開始：「${e.toStage}」・螺旋${e.toCycle}周目`:e.type==="theme"?`テーマを更新：${e.theme}`:`「${e.fromStage}」から「${e.toStage}」へ`,sub=`${fmt(e.changedAt)}${e.theme&&e.type!=="theme"?` · ${e.theme}`:""}`,el=document.createElement("article");el.className="spiral-event";el.innerHTML=`<span class="spiral-node">${i+1}</span><div><strong>${esc(e.journeyName||"旅")}</strong><p>${esc(m)}</p><small>${esc(sub)}</small></div>`;b.appendChild(el)});$("emptySpiralHistory").hidden=!!a.length;$("historySummary").textContent=`${hs().length}件`}
function sync(){const c=snap(),p=read(K.x,{}),a=hs(),now=new Date().toISOString();Object.entries(c).forEach(([id,n])=>{const o=p[id];if(!o&&!n.stageUnknown)a.unshift({id:uid(),journeyId:id,journeyName:n.name,type:"start",fromStage:"",fromCycle:0,toStage:n.stage,toCycle:n.cycle,theme:n.theme,changedAt:now});else if(o&&!n.stageUnknown&&(o.stage!==n.stage||+o.cycle!==+n.cycle))a.unshift({id:uid(),journeyId:id,journeyName:n.name,type:"move",fromStage:o.stage,fromCycle:+o.cycle||1,toStage:n.stage,toCycle:n.cycle,theme:n.theme,changedAt:now});else if(o&&o.theme!==n.theme&&n.theme)a.unshift({id:uid(),journeyId:id,journeyName:n.name,type:"theme",fromStage:n.stage,fromCycle:n.cycle,toStage:n.stage,toCycle:n.cycle,theme:n.theme,changedAt:now})});write(K.h,a.slice(0,300));write(K.x,c);render()}
function prefs(){const v=read(K.f,{});return v&&typeof v==="object"?v:{}}
function fill(){const p=prefs();$("profileFormat")&&($("profileFormat").value=["manga","newspaper","novel","picturebook"].includes(p.storyFormat)?p.storyFormat:"manga");$("profileTone")&&($("profileTone").value=["balanced","gentle","direct"].includes(p.mentorTone)?p.mentorTone:"balanced")}
function savePrefs(){write(K.f,{storyFormat:$("profileFormat")?.value||"manga",mentorTone:$("profileTone")?.value||"balanced",updatedAt:new Date().toISOString()})}
function week(){const n=new Date();n.setHours(0,0,0,0);const s=new Date(n);s.setDate(n.getDate()-(n.getDay()+6)%7);const e=new Date(s);e.setDate(s.getDate()+7);const a=read(K.s,[]);return(Array.isArray(a)?a:[]).filter(v=>{const t=new Date(v.occurredAt).getTime();return t>=s.getTime()&&t<e.getTime()}).sort((a,b)=>new Date(a.occurredAt)-new Date(b.occurredAt))}
async function copy(t){try{await navigator.clipboard.writeText(t);return true}catch{const a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();const ok=document.execCommand("copy");a.remove();return ok}}
function url(){const a=read(K.home,{}),b=read(K.legacy,{}),c=read(K.taxi,{});return a.yosUrl||b.yosUrl||c.yosUrl||""}
function archetypeName(id){return AM.get(id)||""}
function realityLines(journey){const r=journey?.reality&&typeof journey.reality==="object"?journey.reality:{};return [["身体",r.body],["心",r.mind],["時間",r.time],["お金",r.money],["人間関係",r.relationships],["環境",r.environment]].filter(([,v])=>v).map(([k,v])=>`- ${k}：${v}`)}
async function consult(ev){
  ev.preventDefault();ev.stopImmediatePropagation();
  const p=read(K.p,{}),q=prefs(),items=js(),focus=items.find(j=>j.id===p.focusDomain)||items[0]||{};
  const tone=q.mentorTone==="gentle"?"優しく寄り添いながら、曖昧にせず伝える":q.mentorTone==="direct"?"結論を先に、率直かつ短く伝える":"率直さと優しさのバランスを取る";
  const archetypes=focus.archetypes&&typeof focus.archetypes==="object"?focus.archetypes:{};
  const active=(Array.isArray(archetypes.active)?archetypes.active:[]).map(archetypeName).filter(Boolean);
  const balance={helping:"助けになっている",overused:"強く出過ぎている",unknown:"分からない"}[archetypes.balance]||"未記録";
  const scenes=week().slice(-3).map(v=>{const d=items.find(j=>j.id===v.domainId),details=[["事実",v.fact],["感情",v.feeling],["選択",v.choice],["結果",v.result],["今の解釈",v.reflection],["自分で選べること",v.controllable],["次の一手",v.next]].filter(([,value])=>value).map(([label,value])=>`${label}：${value}`).join("／");return`- ${fmt(v.occurredAt)}［${d?.name||"未設定"}］${details}`});
  const text=[
    "【Hero’s Journey｜現在地相談】",
    `主人公：${p.name||"主人公"}`,
    `希望する話し方：${tone}`,
    "",
    `注目する旅：${focus.name||"未設定"}`,
    `コンパス：${focus.compass||"未記録"}`,
    `物語上の現在地：${focus.stageUnknown?"分からない":focus.stage||"未記録"}`,
    `今前へ出ている力：${active.length?active.join("、"):"未記録"}`,
    `今必要だと思う力：${archetypeName(archetypes.needed)||"未記録"}`,
    `力の状態：${balance}`,
    `力についての本人メモ：${archetypes.note||"未記録"}`,
    "",
    "現実の状態",
    ...(realityLines(focus).length?realityLines(focus):["- 未記録"]),
    "",
    `自分で選べること：${focus.controllable||"未記録"}`,
    `次の一手：${focus.quest||"未記録"}`,
    `持ち帰ったもの：${focus.treasure||"未記録"}`,
    "",
    "直近の本人記録",
    ...(scenes.length?scenes:["- 未記録"]),
    "",
    "次の順で確認してください：事実→感情→今の解釈→思い込みの有無→自分で選べること→次の一手1つ。",
    "ステージとアーキタイプは断定せず、本人へ確認してください。固定タイプ診断や優劣づけはしないでください。",
    "安全と現実の状態を先に確認し、休息・撤退・保留も選択肢に含めてください。",
    "つらい出来事を成長・感謝・運命へ勝手に変換しないでください。保存されていない感情や意味を追加しないでください。",
    "結果、偶然、他人の選択まで本人が支配できるとは扱わないでください。"
  ].join("\n");
  const ok=await copy(text),u=url();
  if(u.startsWith("https://chatgpt.com/")){status(ok?"現在地と保存済みの事実をコピーしてYOSを開きます。":"YOSを開きます。");location.href=u}
  else status(ok?"現在地と保存済みの事実をコピーしました。YOSホームでチャットURLを設定してください。":"相談文をコピーできませんでした。")
}
$("consultYos")?.addEventListener("click",consult,true);$("editProfile")?.addEventListener("click",()=>setTimeout(fill,20));$("onboardingForm")?.addEventListener("submit",savePrefs,true);window.addEventListener("hj:data-changed",()=>setTimeout(sync,30));document.addEventListener("click",e=>{if(e.target?.dataset?.role==="save"||e.target?.id==="addDomain")setTimeout(sync,80)},true);fill();const preferred=prefs().storyFormat,btn=document.querySelector(`[data-format="${preferred}"]`);btn?.click();sync()})();

