'use strict';
(() => {
const STAGES=['日常世界','冒険への誘い','ためらい','メンターとの出会い','最初の境界線','試練・仲間・敵','最も深い場所へ','最大の試練','報酬','帰路','復活','宝を持って帰還'];
const JOURNEYS_KEY='hj-domain-journeys-v1',STORIES_KEY='hj-weekly-stories-v1',SCHEMA='hj-prototype-backup-v1';
const $=(id)=>document.getElementById(id),nowIso=()=>new Date().toISOString();
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clean=(value,max=1200)=>typeof value==='string'?value.trim().slice(0,max):'';
const defaults=[
{id:'work',name:'仕事',icon:'💼',stage:'試練・仲間・敵',cycle:1,theme:'',updatedAt:''},
{id:'life',name:'生活',icon:'🏠',stage:'帰路',cycle:1,theme:'',updatedAt:''},
{id:'money',name:'お金',icon:'¥',stage:'冒険への誘い',cycle:1,theme:'',updatedAt:''},
{id:'relations',name:'人間関係',icon:'🤝',stage:'日常世界',cycle:1,theme:'',updatedAt:''},
{id:'dream',name:'夢・挑戦',icon:'✨',stage:'冒険への誘い',cycle:1,theme:'',updatedAt:''}
];
function read(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function normalizeJourney(value){if(!value||typeof value!=='object')return null;const name=clean(value.name,24);if(!name)return null;return{id:clean(value.id,100)||uid(),name,icon:clean(value.icon,4)||'🧭',stage:STAGES.includes(value.stage)?value.stage:STAGES[0],cycle:Math.max(1,Math.min(99,Number(value.cycle)||1)),theme:clean(value.theme,160),updatedAt:clean(value.updatedAt,60)}}
function normalizeStory(value){if(!value||typeof value!=='object')return null;const facts=clean(value.facts);if(!facts)return null;return{id:clean(value.id,100)||uid(),period:clean(value.period,40),domainId:clean(value.domainId,100),format:['manga','newspaper','novel','picturebook'].includes(value.format)?value.format:'manga',facts,choice:clean(value.choice,800),result:clean(value.result,800),learning:clean(value.learning,800),next:clean(value.next,180),savedAt:clean(value.savedAt,60)||nowIso()}}
let journeys=read(JOURNEYS_KEY,defaults).map(normalizeJourney).filter(Boolean);if(!journeys.length)journeys=defaults.map((item)=>({...item}));
let stories=read(STORIES_KEY,[]).map(normalizeStory).filter(Boolean).slice(0,100),selectedFormat='manga',previewStory=null;
const formatNames={manga:'漫画',newspaper:'新聞',novel:'短編小説',picturebook:'絵本'};
const setStatus=(message)=>{$('appStatus').textContent=message};
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeAttr=(value)=>escapeHtml(value).replace(/`/g,'&#96;');
function formatDate(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(d)}
function stageOptions(selected){return STAGES.map((stage)=>`<option${stage===selected?' selected':''}>${stage}</option>`).join('')}
function saveJourneys(){const ok=write(JOURNEYS_KEY,journeys);setStatus(ok?'旅の現在地を保存しました。':'保存できませんでした。');renderAll()}
function renderJourneys(){
const list=$('journeyList');list.innerHTML='';
journeys.forEach((journey)=>{
const card=document.createElement('article');card.className='journey-card';
card.innerHTML=`<div class="journey-title"><span>${journey.icon}</span><div><strong>${escapeHtml(journey.name)}</strong><small>${STAGES.indexOf(journey.stage)+1} / 12 · ${journey.cycle}周目</small></div></div><div class="journey-grid"><label>現在のステージ<select data-role="stage">${stageOptions(journey.stage)}</select></label><label>周回<input data-role="cycle" type="number" min="1" max="99" value="${journey.cycle}"></label></div><label class="theme-field">今回のテーマ<input data-role="theme" maxlength="160" value="${escapeAttr(journey.theme)}" placeholder="例：自分に合う働き方を作る"></label><div class="card-actions"><button class="secondary" type="button" data-role="save">保存</button></div>`;
card.querySelector('[data-role="save"]').addEventListener('click',()=>{journey.stage=card.querySelector('[data-role="stage"]').value;journey.cycle=Math.max(1,Math.min(99,Number(card.querySelector('[data-role="cycle"]').value)||1));journey.theme=clean(card.querySelector('[data-role="theme"]').value,160);journey.updatedAt=nowIso();saveJourneys()});
list.appendChild(card);
});
}
function renderSummary(){
const box=$('journeySummary');box.innerHTML='';
journeys.forEach((journey)=>{const row=document.createElement('article');row.className='summary-row';row.innerHTML=`<span class="icon">${journey.icon}</span><div><strong>${escapeHtml(journey.name)}</strong><small>${escapeHtml(journey.theme||'テーマ未設定')}</small></div><b>${STAGES.indexOf(journey.stage)+1}/12 · ${journey.cycle}周</b>`;box.appendChild(row)});
$('journeyCount').textContent=journeys.length;const mostActive=journeys.slice().sort((a,b)=>STAGES.indexOf(b.stage)-STAGES.indexOf(a.stage))[0];$('activeStage').textContent=mostActive?`${STAGES.indexOf(mostActive.stage)+1}/12`:'—';$('storyCount').textContent=stories.length;
}
function renderDomainSelect(){const select=$('storyDomain'),current=select.value;select.innerHTML=journeys.map((j)=>`<option value="${escapeAttr(j.id)}">${j.icon} ${escapeHtml(j.name)}</option>`).join('');if(journeys.some((j)=>j.id===current))select.value=current}
function renderHistory(){
const box=$('storyHistory');box.innerHTML='';
stories.slice(0,10).forEach((story)=>{const domain=journeys.find((j)=>j.id===story.domainId),article=document.createElement('article');article.innerHTML=`<strong>${escapeHtml(story.period||'期間未設定')}｜${formatNames[story.format]}</strong><small>${domain?`${domain.icon} ${escapeHtml(domain.name)} · `:''}${formatDate(story.savedAt)}</small>`;article.addEventListener('click',()=>loadStory(story));box.appendChild(article)});
$('emptyHistory').hidden=stories.length>0;
}
function renderAll(){renderJourneys();renderSummary();renderDomainSelect();renderHistory()}
function addDomain(){const name=clean($('customDomain').value,24);if(!name){setStatus('追加する旅の名前を入力してください。');return}journeys.push({id:uid(),name,icon:'🧭',stage:STAGES[0],cycle:1,theme:'',updatedAt:nowIso()});$('customDomain').value='';write(JOURNEYS_KEY,journeys);renderAll();setStatus(`「${name}」の旅を追加しました。`)}
function collectStory(){const facts=clean($('storyFacts').value);if(!facts){setStatus('まず、今週起きた事実を入力してください。');$('storyFacts').focus();return null}return normalizeStory({id:uid(),period:$('storyPeriod').value,domainId:$('storyDomain').value,format:selectedFormat,facts,choice:$('storyChoice').value,result:$('storyResult').value,learning:$('storyLearning').value,next:$('storyNext').value,savedAt:nowIso()})}
function renderPreview(story){
const domain=journeys.find((j)=>j.id===story.domainId),title=story.period?`${story.period}の物語`:'今週の物語';
const labels={manga:['第1場面｜起きたこと','第2場面｜主人公の選択','第3場面｜結果','持ち帰った宝','次回へ続く一歩'],newspaper:['今週の主な出来事','本人が取った行動','確認された結果','今週の分析資料','次週の焦点'],novel:['その週に起きたこと','その時に選んだこと','その後どうなったか','残った気づき','次に進む方向'],picturebook:['今週のできごと','えらんだこと','そのあと','みつけたもの','つぎのページ']};
const values=[story.facts,story.choice,story.result,story.learning,story.next],work=$('storyWork');work.className=`work ${story.format}`;
work.innerHTML=`<h3>${escapeHtml(title)}</h3><p class="meta">${domain?`${domain.icon} ${escapeHtml(domain.name)}の旅 · `:''}${formatNames[story.format]} · ノンフィクション</p>`+labels[story.format].map((label,i)=>`<section class="work-section"><b>${label}</b><p>${escapeHtml(values[i]||'記録なし')}</p></section>`).join('');
$('previewFormat').textContent=formatNames[story.format];
}
function buildStory(){previewStory=collectStory();if(!previewStory)return;renderPreview(previewStory);$('previewSection').classList.add('visible');$('previewSection').scrollIntoView({behavior:'smooth',block:'start'});setStatus('入力された事実だけで作品を組み立てました。')}
function storyPlainText(story){const domain=journeys.find((j)=>j.id===story.domainId);return[`今週の物語｜${story.period||'期間未設定'}`,`領域：${domain?domain.name:'未設定'}`,`形式：${formatNames[story.format]}`,'','【起きたこと】',story.facts||'記録なし','','【選んだこと・行動】',story.choice||'記録なし','','【結果】',story.result||'記録なし','','【学び・違和感】',story.learning||'記録なし','','【次の一歩】',story.next||'記録なし','','※本人が入力した事実だけで構成。脚色なし。'].join('\n')}
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok}}
function saveStory(){if(!previewStory){setStatus('先に作品を作ってください。');return}stories.unshift({...previewStory,id:uid(),savedAt:nowIso()});stories=stories.slice(0,100);if(!write(STORIES_KEY,stories)){setStatus('作品を保存できませんでした。');return}renderAll();setStatus('今週の物語を本棚へ保存しました。')}
function loadStory(story){selectedFormat=story.format;document.querySelectorAll('[data-format]').forEach((b)=>b.classList.toggle('selected',b.dataset.format===selectedFormat));$('storyPeriod').value=story.period;$('storyDomain').value=story.domainId;$('storyFacts').value=story.facts;$('storyChoice').value=story.choice;$('storyResult').value=story.result;$('storyLearning').value=story.learning;$('storyNext').value=story.next;previewStory={...story};renderPreview(previewStory);$('previewSection').classList.add('visible');document.querySelector('[data-tab="story"]').click();setStatus('保存した物語を開きました。')}
function clearStory(){['storyPeriod','storyFacts','storyChoice','storyResult','storyLearning','storyNext'].forEach((id)=>$(id).value='');previewStory=null;$('previewSection').classList.remove('visible');setStatus('入力欄をクリアしました。')}
async function exportData(){const payload={schema:SCHEMA,exportedAt:nowIso(),journeys,stories},text=JSON.stringify(payload,null,2),file=new File([text],`heros-journey-backup-${new Date().toISOString().slice(0,10)}.json`,{type:'application/json'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({title:"Hero's Journey バックアップ",files:[file]});setStatus('共有シートを開きました。');return}}catch{}const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('バックアップを書き出しました。')}
function resetData(){if(!confirm('この試作で保存した旅と物語をすべて削除しますか？'))return;localStorage.removeItem(JOURNEYS_KEY);localStorage.removeItem(STORIES_KEY);journeys=defaults.map((item)=>({...item}));stories=[];previewStory=null;$('previewSection').classList.remove('visible');renderAll();setStatus('試作データを初期化しました。')}
document.querySelectorAll('[data-tab]').forEach((button)=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach((b)=>b.classList.toggle('active',b===button));$('journeysPanel').classList.toggle('active',button.dataset.tab==='journeys');$('storyPanel').classList.toggle('active',button.dataset.tab==='story')}));
document.querySelectorAll('[data-format]').forEach((button)=>button.addEventListener('click',()=>{selectedFormat=button.dataset.format;document.querySelectorAll('[data-format]').forEach((b)=>b.classList.toggle('selected',b===button));if(previewStory){previewStory.format=selectedFormat;renderPreview(previewStory)}}));
$('addDomain').addEventListener('click',addDomain);$('customDomain').addEventListener('keydown',(e)=>{if(e.key==='Enter')addDomain()});
$('buildStory').addEventListener('click',buildStory);$('clearStory').addEventListener('click',clearStory);$('saveStory').addEventListener('click',saveStory);
$('copyStory').addEventListener('click',async()=>setStatus(await copyText(previewStory?storyPlainText(previewStory):'')?'作品をコピーしました。':'コピーできませんでした。'));
$('exportData').addEventListener('click',exportData);$('resetData').addEventListener('click',resetData);
$('today').textContent=new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date());
renderAll();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>setStatus('オフライン準備に失敗しました。通常利用はできます。'));
})();
