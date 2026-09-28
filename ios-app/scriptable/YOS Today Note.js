// YOS Today Note — posted-paper Morning view
// Production rule: never substitute demo/test values when Morning input is missing.
// Input: args.shortcutParameter (preferred) or args.plainTexts[0].

const rawInput=(()=>{
  const v=args.shortcutParameter;
  if(typeof v==='string'&&v.trim())return v.trim();
  if(v&&typeof v==='object'){
    const s=String(v.text||v.content||v.value||'').trim();
    if(s)return s;
  }
  if(Array.isArray(args.plainTexts)&&args.plainTexts.length){
    const s=String(args.plainTexts[0]||'').trim();
    if(s)return s;
  }
  return '';
})();

const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const clean=v=>String(v??'').replace(/\r/g,'').trim();
const lines=v=>String(v||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean).filter(x=>x!=='：'&&x!==':');

function splitSections(text){
  const out={ROOT:[]};let current='ROOT';
  for(const raw of String(text||'').replace(/\r/g,'').split('\n')){
    const line=raw.trimEnd(),m=line.trim().match(/^【(.+?)】$/);
    if(m){current=m[1].trim();out[current]??=[];continue}
    out[current].push(line);
  }
  return out;
}
function sectionText(sections,names){
  for(const name of names){const v=lines((sections[name]||[]).join('\n'));if(v.length)return v.join('\n')}
  return '';
}
function keyValues(text){
  const out={};
  for(const line of String(text||'').replace(/\r/g,'').split('\n')){
    const m=line.trim().match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/);
    if(m&&!out[m[1].trim()])out[m[1].trim()]=m[2].trim();
  }
  return out;
}
function firstValue(map,keys){for(const k of keys)if(clean(map[k]))return clean(map[k]);return ''}
function timeFrom(value){
  const m=String(value||'').match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g);
  return m&&m.length?m[m.length-1].trim():'';
}
function firstPlanLine(text){
  const v=lines(text);if(!v.length)return '';
  return v[0].replace(/^予定[：:]\s*/,'').replace(/^[-・•]\s*/,'').trim();
}
function parseMorning(text){
  const s=splitSections(text),kv=keyValues(text);
  const today=sectionText(s,['今日','天気']);
  const schedule=sectionText(s,['予定','今日の予定']);
  const tasks=sectionText(s,['タスク','今日のタスク']);
  const money=sectionText(s,['お金','Money','MONEY']);
  const income=sectionText(s,['入金']);
  const caution=sectionText(s,['注意']);
  const yos=sectionText(s,['YOSから今日の一言','一言','YOS']);
  const title=firstValue(kv,['次の予定','予定名','タイトル'])||firstPlanLine(schedule);
  const start=firstValue(kv,['開始','開始時刻']);
  const destination=firstValue(kv,['目的地','場所','行き先']);
  const travel=firstValue(kv,['所要時間','移動']);
  const arrival=firstValue(kv,['到着目安','到着']);
  const departure=firstValue(kv,['出発目安','出発']);
  const untilDeparture=firstValue(kv,['出発まで']);
  const untilStart=firstValue(kv,['開始まで']);
  const status=untilDeparture?`出発まで ${untilDeparture}`:untilStart?`開始まで ${untilStart}`:'';
  let weatherMain=today;
  let uv=firstValue(kv,['UV','UV指数']);
  if(!weatherMain){
    weatherMain=[firstValue(kv,['現在の天気','天気']),firstValue(kv,['今日の予報','予報'])].filter(Boolean).join('\n');
  }
  if(!uv){
    const m=String(today||'').match(/UV(?:指数)?\s*[：:]?\s*([^\n]+)/i);
    if(m)uv=m[1].trim();
  }
  const moneyLines=[money,income].filter(Boolean).join('\n');
  const firstMoney=lines(moneyLines)[0]||'';
  const moneyAmount=(firstMoney.match(/[¥￥]?\s*[\d,]+\s*円?/)||[])[0]||'';
  return {
    title,startTime:timeFrom(start||schedule),destination,travel,arrival,departure,status,
    weatherMain,uv,moneyLines,moneyAmount,tasks,
    nowLines:[caution,yos].filter(Boolean).join('\n')
  };
}
function jpDate(d=new Date()){
  const w=['日','月','火','水','木','金','土'];
  return `${d.getMonth()+1}/${d.getDate()} ${w[d.getDay()]}`;
}
const br=v=>esc(v).replace(/\n/g,'<br>');
const p=parseMorning(rawInput),hasInput=Boolean(rawInput);

const mainCard=hasInput?`
<section class="paper hero"><div class="tape center"></div>
${p.status?`<div class="status">${esc(p.status)}</div>`:''}
<div class="hero-time">${esc(p.startTime||'—:—')}</div>
<div class="hero-title">${esc(p.title||'予定なし')}</div>
${p.destination?`<div class="destination">${esc(p.destination)}</div>`:''}
${(p.departure||p.arrival||p.travel)?`<div class="trip">
<div><span>出発</span><strong>${esc(p.departure||'—')}</strong></div>
<div><span>到着</span><strong>${esc(p.arrival||'—')}</strong></div>
<div><span>移動</span><strong>${esc(p.travel||'—')}</strong></div>
</div>`:''}</section>`
:`<section class="paper hero missing"><div class="tape center"></div>
<div class="status">入力未取得</div>
<div class="hero-title">Morningからデータが届いていません</div>
<div class="missing-copy">テスト値は表示しません。親Shortcut「Morning」から実行してください。</div>
</section>`;

const weatherCard=hasInput&&(p.weatherMain||p.uv)?`
<section class="paper weather"><div class="tape center"></div><div class="label">WEATHER</div>
${p.weatherMain?`<div class="body-text">${br(p.weatherMain)}</div>`:''}
${p.uv?`<div class="uv">UV ${esc(p.uv)}</div>`:''}</section>`:'';

const moneyCard=hasInput&&p.moneyLines?`
<section class="paper money"><div class="tape left"></div><div class="label">MONEY</div>
${p.moneyAmount?`<div class="money-amount">${esc(p.moneyAmount)}</div>`:''}
<div class="small-text">${br(p.moneyLines)}</div></section>`:'';

const nowCard=hasInput&&(p.nowLines||p.tasks)?`
<section class="paper now"><div class="tape right"></div><div class="label">NOW</div>
<div class="now-title">${esc(p.status||'今日の確認')}</div>
${p.nowLines?`<div class="small-text">${br(p.nowLines)}</div>`:''}
${p.tasks?`<div class="task-text">${br(p.tasks)}</div>`:''}</section>`:'';

const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;overflow-x:hidden}
body{background:#b9ad91;color:#29251f;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;background-image:radial-gradient(circle at 16% 20%,rgba(255,255,255,.10) 0 1px,transparent 1.3px),radial-gradient(circle at 74% 62%,rgba(66,52,31,.08) 0 1px,transparent 1.4px),linear-gradient(115deg,rgba(255,255,255,.04),rgba(68,55,36,.05));background-size:17px 19px,23px 29px,100% 100%}
.wrap{width:100%;max-width:720px;margin:0 auto;padding:54px 30px 44px}.top{display:flex;align-items:flex-end;justify-content:space-between;margin:4px 12px 26px;gap:18px}
.brand{background:#f4efe6;padding:18px 24px 16px;transform:rotate(-1deg);box-shadow:0 4px 10px rgba(50,40,25,.10)}.brand small{display:block;font-size:13px;letter-spacing:.28em;font-weight:700;color:#7b7469;margin-bottom:7px}.brand b{font-family:Georgia,serif;font-size:48px;line-height:.9}.date{font-family:Georgia,serif;font-size:31px;transform:rotate(2deg);white-space:nowrap;color:#454037;margin-bottom:18px}
.paper{position:relative;box-shadow:0 8px 16px rgba(54,42,24,.17);overflow:visible}.tape{position:absolute;top:-18px;width:116px;height:36px;background:rgba(230,214,169,.62);box-shadow:0 2px 7px rgba(50,40,22,.08);z-index:2}.center{left:50%;transform:translateX(-50%) rotate(-1deg)}.left{left:32px;transform:rotate(-5deg)}.right{right:34px;transform:rotate(4deg)}
.hero{background:#fff0a3;padding:56px 40px 34px;margin-bottom:36px;min-height:390px}.status{display:inline-block;font-weight:800;font-size:21px;line-height:1.3;margin-bottom:18px}.hero-time{font-size:78px;line-height:.94;font-weight:900;letter-spacing:-.055em;margin-bottom:12px}.hero-title{font-size:36px;line-height:1.15;font-weight:900;overflow-wrap:anywhere;word-break:break-word}.destination{font-size:20px;color:#756c5b;margin-top:15px;overflow-wrap:anywhere}
.trip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:33px;padding-top:23px;border-top:1px dashed rgba(92,78,51,.26)}.trip span{display:block;font-size:15px;font-weight:700;color:#645c50;margin-bottom:8px}.trip strong{display:block;font-size:28px;line-height:1.15;overflow-wrap:anywhere}
.weather{background:#e5eddc;padding:50px 34px 28px;margin-bottom:35px}.label{font-size:14px;letter-spacing:.30em;color:#77766e;font-weight:800;margin-bottom:24px}.body-text{font-size:20px;line-height:1.7;font-weight:650;overflow-wrap:anywhere;word-break:break-word}.uv{font-size:18px;color:#746f64;border-top:1px dashed rgba(92,78,51,.20);margin-top:20px;padding-top:17px;overflow-wrap:anywhere}
.bottom{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:start}.money{background:#dbe9f1;padding:48px 28px 28px;min-height:245px}.now{background:#f6f2e7;padding:48px 28px 28px;min-height:245px}.money-amount{font-size:37px;line-height:1.15;font-weight:900;margin-bottom:13px;overflow-wrap:anywhere}.now-title{font-size:26px;line-height:1.22;font-weight:900;margin-bottom:14px;overflow-wrap:anywhere}.small-text{font-size:17px;line-height:1.52;color:#5f5b54;font-weight:560;overflow-wrap:anywhere;word-break:break-word}.task-text{font-size:16px;line-height:1.48;color:#6c675e;border-top:1px dashed rgba(92,78,51,.18);margin-top:16px;padding-top:14px;overflow-wrap:anywhere;word-break:break-word}.missing{min-height:300px}.missing .hero-title{font-size:31px;margin-top:28px}.missing-copy{font-size:19px;line-height:1.55;margin-top:24px;color:#6f6555;overflow-wrap:anywhere}
@media(max-width:520px){.wrap{padding:48px 24px 36px}.brand{padding:15px 19px 14px}.brand b{font-size:44px}.brand small{font-size:11px}.date{font-size:27px}.hero{padding:50px 32px 30px;min-height:0}.hero-time{font-size:70px}.hero-title{font-size:32px}.destination{font-size:18px}.trip{gap:12px}.trip strong{font-size:24px}.weather{padding:46px 30px 26px}.bottom{gap:18px}.money,.now{padding:44px 22px 24px}.small-text{font-size:16px}}
</style></head><body><main class="wrap">
<div class="top"><div class="brand"><small>YOS DAILY NOTE</small><b>today</b></div><div class="date">${esc(jpDate())}</div></div>
${mainCard}${weatherCard}${(moneyCard||nowCard)?`<div class="bottom">${moneyCard}${nowCard}</div>`:''}
</main></body></html>`;

const web=new WebView();
await web.loadHTML(html);
await web.present(true);
if(typeof Script.setShortcutOutput==='function')Script.setShortcutOutput(rawInput);
Script.complete();
