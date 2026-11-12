// YOS Journal Book: Scriptable WebView reading/review surface. No credentials in UI.
const q=args.queryParameters||{};
const decode=k=>{try {const d=Data.fromBase64String(String(q[k]||''));return d?d.toRawString():'';}catch(e){return '';}};
const input={date:String(q.date||''),story:decode('story'),diary:decode('diary'),question:decode('question'),answer:decode('answer')};
if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!input.story||!input.diary||!input.question||!input.answer){const a=new Alert();a.title='YOS 日記';a.message='必要なデータが不足しています。保存は行いません。';a.addAction('閉じる');await a.present();Script.complete();throw new Error('YOS Journal Book: invalid input');}
// Keep each page readable without vertical scrolling; split longer articles into sheets.
const slices=(value,limit=220)=>{const text=String(value||'');const parts=[];for(let i=0;i<text.length;i+=limit)parts.push(text.slice(i,i+limit));return parts.length?parts:[''];};
const articles=[
  {eyebrow:'01 / THE DAY',title:'一日の記録',body:input.diary,theme:'day'},
  {eyebrow:'02 / THE QUESTION',title:'今日の問い',body:input.question,theme:'question'},
  {eyebrow:'03 / YOUR WORDS',title:'あなたの答え',body:input.answer,theme:'voice'},
  {eyebrow:'04 / THE STORY',title:'今日の物語',body:input.story,theme:'story'}
];
const pages=[{eyebrow:'YOS JOURNAL',title:input.date,body:'今日という一日を、ひとつの物語に。',type:'cover',theme:'cover'}];
for(const article of articles){const parts=slices(article.body,article.theme==='story'?250:210);parts.forEach((part,i)=>pages.push({...article,body:part,type:'article',part:i+1,parts:parts.length}));}
pages.push({eyebrow:'05 / REVIEW',title:'物語を見直す',body:'',type:'review',theme:'story'});
const illustrations={
  cover:'<circle cx="150" cy="100" r="64"/><path d="M20 180 Q95 75 170 180 T320 180"/>',
  day:'<circle cx="245" cy="55" r="35"/><path d="M0 168 Q60 115 120 152 T240 145 T320 160"/><path d="M0 195 Q100 130 180 178 T320 175"/>',
  question:'<path d="M105 65 Q160 10 215 65 Q255 120 160 165"/><circle cx="160" cy="194" r="5"/>',
  voice:'<path d="M25 90 Q70 40 115 90 T205 90 T295 90"/><path d="M25 145 Q70 95 115 145 T205 145 T295 145"/>',
  story:'<path d="M38 180 Q95 120 155 165 Q215 105 282 180"/><circle cx="160" cy="68" r="44"/><path d="M160 24 V112 M116 68 H204"/>'
};
const artwork=theme=>'<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.1" opacity=".66">'+(illustrations[theme]||illustrations.story)+'</g></svg>';
const html=`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#191a1d;color:#e8e1d4;font-family:Georgia,'Hiragino Mincho ProN',serif}body{display:flex;align-items:center;justify-content:center;padding:18px}.book{width:min(100%,480px);height:min(88dvh,820px);position:relative;perspective:1100px}.sheet{height:100%;background:linear-gradient(105deg,#e6ddcb,#f6f0e5 18%,#e8decb);color:#292a2c;border-radius:5px 14px 14px 5px;box-shadow:inset 10px 0 16px #554e4520,10px 18px 35px #0009;display:flex;flex-direction:column;padding:34px 28px 24px;transform-origin:left;transition:transform .36s ease,opacity .36s ease;overflow:hidden}.sheet.turn{transform:rotateY(-75deg);opacity:.25}.cover{background:linear-gradient(140deg,#34373b,#1d2025);color:#e6d9bf;border:1px solid #716b5d}.eyebrow{font:10px system-ui;letter-spacing:.24em;color:#8e806a}.cover .eyebrow{color:#c8b897}h1{font-size:25px;line-height:1.45;font-weight:500;margin:22px 0}.content{white-space:pre-wrap;overflow:hidden;flex:1;line-height:1.8;font-size:15px;scrollbar-width:none}.illustration{height:120px;display:flex;align-items:center;justify-content:center;color:#8e806a}.illustration svg{height:100%;max-width:100%}.cover .illustration{height:220px;color:#c8b897}.cover .content{display:flex;align-items:center;justify-content:center;text-align:center;font-size:20px}.bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:18px;font:12px system-ui}.bottom button,.save{border:1px solid #998e7d;border-radius:5px;background:transparent;color:inherit;padding:10px 14px;font:13px system-ui}.bottom button:disabled{opacity:.25}.save{background:#33383d;color:#fff;border:0}textarea{width:100%;min-height:150px;background:#ffffff8c;border:1px solid #a9a08f;color:#222;font:16px/1.8 Georgia,serif;padding:12px;resize:vertical}small{font:11px/1.6 system-ui;color:#807768}</style></head><body><div class="book"><div id="sheet" class="sheet"><div id="eyebrow" class="eyebrow"></div><h1 id="title"></h1><div id="illustration" class="illustration"></div><div id="content" class="content"></div><div class="bottom"><button id="prev" onclick="turn(-1)">前へ</button><span id="counter"></span><button id="next" onclick="turn(1)">次へ</button></div></div></div><script>
const pages=${JSON.stringify(pages).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')};let index=0;window.yosReviewedStory=${JSON.stringify(input.story).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')};
const art=${JSON.stringify(Object.fromEntries(Object.keys(illustrations).map(k=>[k,artwork(k)])))};const sheet=document.getElementById('sheet');
function render(){const p=pages[index];sheet.classList.toggle('cover',p.type==='cover');document.getElementById('eyebrow').textContent=p.eyebrow;document.getElementById('title').textContent=p.title+(p.parts>1?' '+p.part+'/'+p.parts:'');document.getElementById('illustration').innerHTML=art[p.theme]||art.story;const c=document.getElementById('content');c.replaceChildren();if(p.type==='review'){const hint=document.createElement('small');hint.textContent='必要なら物語を修正してください。本を閉じた後に保存を選べます。';const field=document.createElement('textarea');field.id='storyReview';field.setAttribute('aria-label','保存する物語');field.value=window.yosReviewedStory;field.maxLength=8000;field.oninput=()=>{window.yosReviewedStory=field.value};c.append(hint,field);}else c.textContent=p.body;document.getElementById('prev').disabled=index===0;document.getElementById('next').disabled=index===pages.length-1;document.getElementById('counter').textContent=(index+1)+' / '+pages.length;}
let touchStartX=0;sheet.addEventListener('touchstart',e=>{touchStartX=e.changedTouches[0].screenX},{passive:true});sheet.addEventListener('touchend',e=>{const dx=e.changedTouches[0].screenX-touchStartX;if(Math.abs(dx)>65 && !e.target.closest('textarea'))turn(dx<0?1:-1)},{passive:true});
function turn(d){if(index+d<0||index+d>=pages.length)return;sheet.classList.add('turn');setTimeout(()=>{index+=d;render();sheet.classList.remove('turn');},180)}render();
</script></body></html>`;
const web=new WebView();await web.loadHTML(html);await web.present(false);
// Read back the editable story after closing the book; no custom URL navigation.
const reviewedStory=await web.evaluateJavaScript('window.yosReviewedStory');
if(typeof reviewedStory!=='string'||!reviewedStory.trim()||reviewedStory.length>8000||!input.diary.includes(input.story)){throw new Error('YOS Journal Book: review could not be confirmed; nothing saved');}
const storyAt=input.diary.indexOf(input.story);
const reviewedDiary=input.diary.slice(0,storyAt)+reviewedStory+input.diary.slice(storyAt+input.story.length);
const confirm=new Alert();confirm.title='YOS 日記｜保存';confirm.message='本を閉じました。この日記を既存のNotionへ保存しますか？';confirm.addAction('保存する');confirm.addCancelAction('保存しない');const choice=await confirm.presentAlert();
if(choice===0){const enc=v=>encodeURIComponent(Data.fromString(v).toBase64String());Safari.open('scriptable:///run?scriptName=YOS%20Journal%20Notion%20Bridge&date='+encodeURIComponent(input.date)+'&diary='+enc(reviewedDiary)+'&question='+enc(input.question)+'&answer='+enc(input.answer));}
Script.complete();
