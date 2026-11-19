// Variables used by Scriptable.
// icon-color: gray; icon-glyph: book-open;
// YOS_SCRIPT_NAME: YOS Journal Book
// YOS Journal Book: verified date/memory preview on one textured-paper screen.
// iCloud Calendar and existing Notion Tasks are read-only; never infer real-world completion.
// Notion writing remains exclusively in the existing YOS Journal Notion Bridge.
const q=args.queryParameters||{};
const decode=k=>{try{const d=Data.fromBase64String(String(q[k]||''));return d?d.toRawString():'';}catch(e){return '';}};
// Running the Book itself opens a safe, editable page for today.
// Only explicitly requested "review" mode may hand an existing diary to Notion.
const mode=q.mode==='review'?'review':'compose';
const localToday=new Date(),today=[localToday.getFullYear(),String(localToday.getMonth()+1).padStart(2,'0'),String(localToday.getDate()).padStart(2,'0')].join('-');
const input={date:String(q.date||(mode==='compose'?today:'')),story:decode('story'),diary:decode('diary'),question:decode('question'),answer:decode('answer')};
if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||(mode==='review'&&(!input.story||!input.diary||!input.question||!input.answer))){
  const a=new Alert();a.title='YOS 日記';a.message='必要なデータが不足しています。保存は行いません。';a.addAction('閉じる');await a.present();Script.complete();throw new Error('YOS Journal Book: invalid input');
}
function propText(prop){return (prop?.title||prop?.rich_text||[]).map(t=>t.plain_text||t.text?.content||'').join('');}
const dayStart=new Date(input.date+'T00:00:00'),dayEnd=new Date(dayStart.getTime()+86400000);
const timeline=[];
const foundSources=[];
const clock=d=>{const dt=new Date(d);return Number.isNaN(dt.valueOf())?'終日':String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');};
try{
  if(typeof CalendarEvent!=='undefined'&&typeof CalendarEvent.between==='function'){
    const events=await CalendarEvent.between(dayStart,dayEnd);
    for(const e of events||[]){if(!e?.title)continue;timeline.push({title:String(e.title).slice(0,56),time:e.isAllDay?'終日':clock(e.startDate),done:false,source:'calendar'});}
    foundSources.push('calendar');
  }
}catch(e){/* missing calendar permission is not proof the user had no activity */}
try{
  if(typeof Keychain!=='undefined'&&Keychain.contains('YOS_NOTION_INTEGRATION_TOKEN')&&typeof Request!=='undefined'){
    const r=new Request('https://api.notion.com/v1/data_sources/965c6086-32c1-463d-93b4-87a9cb69b3ad/query');
    r.method='POST';r.timeoutInterval=8;
    r.headers={'Authorization':'Bearer '+Keychain.get('YOS_NOTION_INTEGRATION_TOKEN'),'Notion-Version':'2025-09-03','Content-Type':'application/json'};
    r.body=JSON.stringify({filter:{and:[{property:'期限',date:{on_or_after:input.date}},{property:'期限',date:{before:[dayEnd.getFullYear(),String(dayEnd.getMonth()+1).padStart(2,'0'),String(dayEnd.getDate()).padStart(2,'0')].join('-')}}]},page_size:100});
    const rows=await r.loadJSON();
    if(r.response?.statusCode>=200&&r.response?.statusCode<300){
      for(const page of rows.results||[]){
        const p=page.properties||{};const title=propText(p['やること'])||propText(p['名前'])||propText(p['Name']);
        const start=p['期限']?.date?.start;
        if(!title||!start||start.slice(0,10)!==input.date)continue;
        const status=p['状態']?.select?.name||p['状態']?.status?.name||'';
        timeline.push({title:title.slice(0,56),time:start.includes('T')?clock(start):'終日',done:status==='完了',source:'notion'});
      }
      foundSources.push('notion');
    }
  }
}catch(e){/* no fabricated tasks if Notion is inaccessible */}
const matched=new Map();
for(const e of timeline){const key=e.title.trim().toLowerCase()+'|'+e.time;const prior=matched.get(key);if(!prior||(!prior.done&&e.done))matched.set(key,e);}
const distinct=[...matched.values()];
distinct.sort((a,b)=>((a.time==='終日'?'99:99':a.time).localeCompare(b.time==='終日'?'99:99':b.time)));
// Only a photo the person supplied or explicitly chose on this device is shown.
// Never treat the latest unrelated camera-roll image as today's event.
let photo=q.photo&&/^data:image\/(jpeg|png|webp);base64,/.test(q.photo)&&q.photo.length<400000?String(q.photo):'';
if(!photo && typeof FileManager!=='undefined'){
 try{
   const fm=FileManager.local(),file=fm.joinPath(fm.documentsDirectory(),'YOS-Journal-Photo-'+input.date+'.png');
   if(fm.fileExists(file)){
     const imageData=fm.read(file),base64=imageData.toBase64String();
     if(base64.length<400000)photo='data:image/png;base64,'+base64;
   }
 }catch(e){/* no silent use of a different day's photo */}
}
const model={date:input.date,mode,story:input.story,timeline:distinct.slice(0,6),photo,emptyMessage:foundSources.length?'該当する予定・完了記録はありません':'予定・行動の記録は未取得'};
const safeJSON=JSON.stringify(model).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
const html = "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><style>\n:root{color-scheme:light;--ink:#4b3024;--muted:#99795e;--gold:#bb925f;--highlight:#d7d4d2;--wash:#e5bc77;--paper:#f2dfc2}\n*{box-sizing:border-box}\nhtml,body{margin:0;min-height:100%;height:100%}\nbody{background:#28160e;color:var(--ink);overflow:hidden;font-family:\"Klee\",\"YuKyokasho\",\"Hiragino Maru Gothic ProN\",\"Hiragino Mincho ProN\",serif;-webkit-text-size-adjust:100%}\nbutton,textarea{font:inherit;-webkit-tap-highlight-color:transparent}\nbutton{cursor:pointer}\n.stage{height:100dvh;overflow-y:auto;overscroll-behavior:contain;padding:7px 7px 11px;background:linear-gradient(105deg,#2a180e99,#5d301c55),url(data:image/webp;base64,UklGRnwBAABXRUJQVlA4IHABAADwCgCdASpQAFAAPplCmEioJCKiNHv4AQATCWNrh57lKLEcHdv/5/6IA3v8D2CnT4/EDNtzCNKrB7MQuUglhnsHRoVzAMjp8Wu3ww6B3h2oIW/QSv21c0QVXRTDTzwJGAAA/vUG68CvasoWq7fOiazAtXeIZUyOk/m5+Q2ExFZj70b8SAwYzQ25skawU2cvyQqfttLDFgb8TH1YQk+QkhqEX/6lbww/p/BGmvr8s8Yy9CItbtYXcFF1G7YRWbP0/j0gmlJBkcJiIbgA4Pw3+GsNOW2GdxghNG2I6avwNG5t8JyKLrPgXARSC8GDXHnvPtdLWO+GVLEaxOB5v/8rAp4Opj3WoP6LqagXEEJaVls4x6tVlm7EXcc860vf7MzMNMOIDFs/RlwYbswcnw1iIwhDNi5QfLMF3QJ9Fq4EnbUfGM/HfRPNXjwPkw79KEFL7qUZUvIzR4w8cHhlodmf46wq4KMkq53xFIg3Hehe6D8AAA==);background-size:cover,80px 80px;scrollbar-width:thin}\n.page{position:relative;width:100%;max-width:580px;min-height:calc(100dvh - 18px);margin:0 auto;padding:22px 17px 28px 23px;overflow:hidden;isolation:isolate;border:1px solid #bf986d;border-radius:16px 21px 22px 11px;background:linear-gradient(102deg,#ecd4b4a8 0%,#f6e8d493 14%,#f8e6c98c 82%,#dfb98c8a 100%),url(data:image/webp;base64,UklGRrIAAABXRUJQVlA4IKYAAAAwBQCdASpQAFAAPqFQn02mJKMiIUsAwBQJaWuU8QRaEBROkB53Xgw0rgn2ajDUmdNGYAD+8bHv4wmkYDCbstEEHw1Krh5DIpEAcUq0bkLeeWCiwbV/YZ+HBSwT+ji30hfK94PWOJyPAl0JlXd6zDUIDzXG4npgtWZBjoxVoddckJq5LsGjti9ZfFRAzm8nKMqffPHIlXLMrg6gWv/dgYxYFkMl6zgA);background-size:cover,80px 80px;box-shadow:inset 8px 0 13px #7441201f,inset -5px 0 8px #9f68361c,0 5px 0 #c19a6b,0 13px 23px #080402aa}\n.page::before{content:\"\";position:absolute;inset:7px 5px 9px;z-index:-1;pointer-events:none;border:1px solid #b98f6428;border-radius:11px 18px 19px 9px;background:radial-gradient(circle at 16% 26%,#fff7eb32,transparent 42%),repeating-linear-gradient(3deg,transparent 0 5px,#88582a06 6px 7px)}\n.page::after{content:\"\";position:absolute;top:0;right:0;width:11px;height:100%;pointer-events:none;background:linear-gradient(90deg,transparent,#ae7b4115 58%,#a5713850)}\n.clip{position:absolute;top:-6px;right:clamp(22px,8vw,45px);width:26px;height:37px;z-index:4;transform:rotate(5deg);background:linear-gradient(90deg,#6f491f,#b58b4a 15%,#e4c184 37%,#b8884a 72%,#715028);border:1px solid #73512c;border-radius:0 0 5px 5px;box-shadow:1px 3px 4px #5c381b50}\n.clip::after{content:\"\";position:absolute;left:-6px;right:-6px;bottom:0;height:9px;border-radius:3px 3px 4px 4px;background:linear-gradient(#f1cf95,#91622a 85%);border:1px solid #8c642e}\n.letter{font-family:\"Klee\",\"YuKyokasho\",\"Hiragino Maru Gothic ProN\",\"Hiragino Mincho ProN\",serif}\n.header{display:grid;grid-template-columns:minmax(0,46%) minmax(0,54%);gap:3px;align-items:start;padding:10px 4px 0 7px}\n.titlemark{font:italic 17px/1.1 \"Bradley Hand\",\"Snell Roundhand\",\"Comic Sans MS\",cursive;color:#553c2e;transform:rotate(-4deg);white-space:nowrap;display:inline-block;border-bottom:1px solid #987151;padding-bottom:3px}\n.date{margin-top:23px;display:flex;align-items:baseline;gap:5px;white-space:nowrap;transform:rotate(-3deg)}\n.date .month,.date .number{font:italic clamp(27px,7vw,39px)/1.2 \"Bradley Hand\",\"Klee\",cursive}\n.date .slash{font:italic 25px/1.2 Georgia,serif;color:#9b714e}\n.date .dow{font-size:clamp(13px,3.2vw,18px);margin-left:4px}\n.date-underline{width:88%;height:5px;margin-top:4px;transform:rotate(-2deg);border-radius:30% 70% 55% 45%;background:#c9907980}\n.header-scribble{margin:17px 0 0 7px;font-size:11px;line-height:1.55;color:#876548;transform:rotate(-4deg)}\n.schedule{padding:24px 0 0 1px;transform:rotate(-2deg);min-width:0}\n.brush{display:inline-block;padding:3px 11px 1px;background:linear-gradient(98deg,#e9c48a82,#dcb885bb 75%,#e7cf9c59);clip-path:polygon(2% 12%,95% 0,100% 28%,97% 80%,5% 100%,0 78%);color:#593925;font-size:clamp(13px,3.5vw,17px);line-height:1.5}\n.schedule .brush{white-space:nowrap}\n.events{position:relative;list-style:none;padding:3px 0 0 6px;margin:7px 0 0;max-height:205px;overflow:auto;scrollbar-width:none}\n.events::before{content:\"\";position:absolute;left:1px;top:0;bottom:2px;width:7px;border-left:1.5px solid #8e6b4a;border-radius:40%}\n.events li{display:grid;grid-template-columns:37px minmax(0,1fr) 17px;gap:3px;align-items:baseline;padding:3px 0 4px 7px;min-width:0;font-size:clamp(10px,2.75vw,12px);line-height:1.55}\n.events li:nth-child(2n){transform:rotate(1deg)}\n.events .time{font:italic 11px/1.3 Georgia,serif;color:#70533d}\n.events .name{min-width:0;overflow-wrap:anywhere}\n.events .check{font-size:13px;color:#7e654c;text-align:right}\n.events .done .check{color:#506d4b}\n.events .empty{display:block;color:#94765b;font-size:11px}\n.events .status{position:absolute;left:-9999px}\n.day-note{margin:6px 0 0 10px;font-size:9px;color:#a2866c;line-height:1.5}\n.story-grid{display:grid;grid-template-columns:minmax(20px,8%) minmax(0,1fr) minmax(40px,16%);gap:2px;margin:24px 0 3px;align-items:start}\n.margin-left{font-size:11px;color:#876347;transform:rotate(-9deg);padding-top:90px;line-height:1.5;overflow-wrap:anywhere}\n.margin-left .tiny-line{display:block;border-bottom:1px solid #ba966b;transform:rotate(-14deg);margin:7px 2px}\n.margin-right{padding-top:100px;transform:rotate(5deg);font-size:10px;line-height:1.7;color:#805d40;overflow-wrap:anywhere}\n.margin-right .small-brush{background:#e5c48b6b;display:inline-block;padding:2px;transform:rotate(-4deg);font-size:11px}\n.done-list{margin:9px 0 0;padding:0;list-style:none}\n.done-list li{margin-bottom:7px}\n.done-list li::before{content:\"✓ \";color:#8d724f}\n.done-list .empty{font-size:9px;color:#967c61}\n.story-main{min-width:0}\n.story-heading{position:relative;display:inline-block;padding:3px 5px 6px;margin:0 0 15px;font-size:clamp(23px,6.2vw,31px);font-weight:500;letter-spacing:.035em;transform:rotate(-3deg);white-space:nowrap}\n.story-heading::after{content:\"\";position:absolute;left:-7px;right:-13px;bottom:3px;height:13px;z-index:-1;transform:rotate(-1deg);background:#a9b5c188;clip-path:polygon(0 45%,10% 16%,50% 20%,91% 0,100% 60%,88% 90%,33% 94%,0 75%)}\n.note{position:relative;min-height:clamp(320px,42vh,500px);padding:0 1px;background:transparent;border:0;box-shadow:none}\n#storyReview,#ink{display:block;width:100%;min-height:clamp(320px,42vh,500px);padding:2px 0 5px;margin:0;border:0;background:transparent;outline:none;font-family:\"Klee\",\"YuKyokasho\",\"Hiragino Maru Gothic ProN\",\"Hiragino Mincho ProN\",serif;font-weight:400;font-size:clamp(15px,4vw,19px);line-height:1.95;color:#39271e;letter-spacing:.018em;word-break:break-word;overflow-wrap:anywhere}\n#storyReview{resize:none;caret-color:#b37941;overflow-y:hidden}\n#storyReview::placeholder{color:#b39577}\n#ink{display:none;white-space:pre-wrap}\n.note.finished #storyReview{display:none}.note.finished #ink{display:block}\n.mini-note{margin-top:17px;font-size:10px;color:#a18566;line-height:1.5}\n.lower{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 126px;gap:5px;align-items:end;margin:14px 5px 10px 16px;min-height:157px}\n.mood{align-self:center;min-width:0}\n.mood .brush{font-size:15px;transform:rotate(-3deg);padding:1px 10px}\n.mood .choices{display:flex;flex-wrap:wrap;gap:7px 6px;margin-top:13px;max-width:220px}\n.mood button{width:34px;height:34px;border:1px solid #a8835d;border-radius:50%;font-size:10px;background:#f2ddbd51;color:#6d503c;transform:rotate(-5deg)}\n.mood button:nth-child(2n){transform:rotate(7deg)}\n.mood button[aria-pressed=\"true\"]{background:#d19c6caa;border:2px solid #8b5b36;box-shadow:0 0 0 3px #e4b16e52;color:#452916}\n.day-sign{font-size:11px;color:#8b684e;margin:11px 0 0 5px;transform:rotate(-4deg)}\n.photocard{position:relative;width:121px;height:146px;max-width:100%;margin:0 0 0 auto;padding:7px 7px 19px;border:1px solid #d1b99e;border-radius:0;background:#fef5e7;box-shadow:0 4px 10px #6e4b3154;transform:rotate(6deg);display:flex;justify-content:center;align-items:center;font:11px/1.5 \"Klee\",\"YuKyokasho\",serif;color:#9a8064;overflow:visible}\n.photocard::before{content:\"\";position:absolute;top:-11px;left:38%;width:48px;height:22px;background:#d6b18490;transform:rotate(-9deg);z-index:3;box-shadow:0 0 1px #b98e6480}\n.photocard.blank::after{content:\"＋\";display:block;position:absolute;top:36px;left:0;right:0;text-align:center;font-size:24px;color:#bca183;pointer-events:none}\n.photocard.blank{padding-top:32px}\n.photocard.real{padding:6px 6px 18px}\n.photocard img{width:100%;height:100%;object-fit:cover;display:block}\n.paper-footer{border-top:1px solid #c4a17c5a;padding:13px 2px 0;margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:10px}\n#finish{font-size:13px;color:#543524;letter-spacing:.04em;padding:8px 15px;background:#d3a97870;border:1px solid #a67e52;border-radius:4px 8px 5px 7px;transform:rotate(-2deg);box-shadow:2px 3px 0 #a67e5229}\n.help{font-size:10px;color:#96775b;max-width:59%;line-height:1.5;text-align:right}\n@media(min-width:510px){.page{padding:32px 34px 37px 36px}.story-grid{grid-template-columns:9% minmax(0,1fr) 15%;gap:8px}.story-heading{font-size:30px}.header{grid-template-columns:48% 52%}.story-grid{margin-top:39px}.margin-right{font-size:12px}.margin-left{font-size:12px}}\n@media(max-width:365px){.page{padding:16px 10px 22px 14px}.header{padding-left:1px}.titlemark{font-size:15px}.events li{grid-template-columns:34px minmax(0,1fr) 15px;gap:2px;font-size:10px}.brush{font-size:12px}.story-grid{grid-template-columns:6% minmax(0,1fr) 16%;gap:3px}.margin-left{font-size:9px}.margin-right{font-size:9px}.story-heading{font-size:21px}.lower{grid-template-columns:minmax(0,1fr) 102px;margin-left:4px}.photocard{width:96px;height:124px}.mood button{width:30px;height:30px}}\n@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}\n</style></head><body>\n<div class=\"stage\"><main class=\"page\">\n<div class=\"clip\" aria-hidden=\"true\"></div>\n<header class=\"header\">\n  <div class=\"headleft\">\n    <div class=\"titlemark\">YOS Night Journal</div>\n    <div class=\"date\"><span class=\"month\" id=\"month\"></span><span class=\"slash\">/</span><span class=\"number\" id=\"day\"></span><span class=\"dow\" id=\"dow\"></span></div>\n    <div class=\"date-underline\" aria-hidden=\"true\"></div>\n    <div class=\"header-scribble\">今日を、書きとめる。</div>\n  </div>\n  <section class=\"schedule\" aria-label=\"今日の予定・行動\">\n    <div class=\"brush\">今日の予定（ざっくり）</div>\n    <ul class=\"events\" id=\"events\"></ul>\n    <div class=\"day-note\">✓ 完了した記録　□ 予定</div>\n  </section>\n</header>\n<section class=\"story-grid\">\n  <aside class=\"margin-left\" aria-hidden=\"true\"><span>☕</span><span class=\"tiny-line\"></span><span>きょう<br>の<br>余白</span></aside>\n  <div class=\"story-main\">\n    <h1 class=\"story-heading\">今日の記録</h1>\n    <div class=\"note\" id=\"note\">\n      <textarea id=\"storyReview\" maxlength=\"8000\" aria-label=\"今日の記録\" placeholder=\"今日、どんなことがあった？&#10;思い出したことを一言だけ。\"></textarea>\n      <div id=\"ink\" aria-label=\"今日の日記本文\"></div>\n    </div>\n    <div class=\"mini-note\" id=\"quietNote\">手書きのように、短くてもいい。</div>\n  </div>\n  <aside class=\"margin-right\" aria-label=\"できたことの記録\">\n    <span class=\"small-brush\">できたこと</span>\n    <ul class=\"done-list\" id=\"doneList\"></ul>\n    <span class=\"tiny-line\"></span>\n  </aside>\n</section>\n<section class=\"lower\">\n  <div class=\"mood\"><div class=\"brush\">今日の気分</div>\n    <div class=\"choices\" id=\"moods\">\n      <button type=\"button\" data-mood=\"満足\" aria-pressed=\"false\" aria-label=\"満足\">満</button>\n      <button type=\"button\" data-mood=\"穏やか\" aria-pressed=\"false\" aria-label=\"穏やか\">穏</button>\n      <button type=\"button\" data-mood=\"ふつう\" aria-pressed=\"false\" aria-label=\"ふつう\">普</button>\n      <button type=\"button\" data-mood=\"疲れた\" aria-pressed=\"false\" aria-label=\"疲れた\">疲</button>\n      <button type=\"button\" data-mood=\"つらい\" aria-pressed=\"false\" aria-label=\"つらい\">辛</button>\n    </div>\n    <div class=\"day-sign\">今日も、ここに残す。</div>\n  </div>\n  <button type=\"button\" class=\"photocard blank\" id=\"photo\" aria-label=\"今日の写真を選ぶ\">今日の写真<br>写真を選ぶ</button>\n</section>\n<footer class=\"paper-footer\"><button type=\"button\" id=\"finish\">書き終えた</button><span class=\"help\" id=\"help\">一言書いたら、書き終えたを押す</span></footer>\n</main></div>\n<script>\nconst model=__DATA__;\nwindow.yosReviewedStory=model.story;\nwindow.yosMood=model.mood||'';\nwindow.yosFinish=false;\nwindow.yosPickPhoto=false;\nconst d=new Date(model.date+'T12:00:00');\nconst week=['日','月','火','水','木','金','土'];\ndocument.getElementById('month').textContent=d.getMonth()+1;\ndocument.getElementById('day').textContent=d.getDate();\ndocument.getElementById('dow').textContent='（'+week[d.getDay()]+'）';\nconst events=document.getElementById('events');\nconst doneList=document.getElementById('doneList');\nif(!model.timeline.length){\n const li=document.createElement('li');li.className='empty';li.textContent=model.emptyMessage;events.append(li);\n}\nmodel.timeline.forEach(e=>{\n const li=document.createElement('li');li.className=e.done?'done':'planned';\n const time=document.createElement('span');time.className='time';time.textContent=e.time;\n const name=document.createElement('span');name.className='name';name.textContent=e.title;\n const check=document.createElement('span');check.className='check';check.textContent=e.done?'☑':'□';\n const status=document.createElement('span');status.className='status';status.textContent=e.done?'完了':'予定';\n li.append(time,name,check,status);events.append(li);\n});\nconst completed=model.timeline.filter(e=>e.done).slice(0,3);\nif(!completed.length){\n const li=document.createElement('li');li.className='empty';li.textContent='記録なし';doneList.append(li);\n}\ncompleted.forEach(e=>{const li=document.createElement('li');li.textContent=e.title;doneList.append(li);});\nconst photo=document.getElementById('photo');\nif(model.photo){\n photo.classList.replace('blank','real');photo.textContent='';\n const img=document.createElement('img');img.src=model.photo;img.alt='本人が選んだ今日の写真';photo.append(img);\n}\nconst help=document.getElementById('help');\nphoto.addEventListener('click',()=>{window.yosPickPhoto=true;help.textContent='右上の完了を押すと写真を選べます';});\nconst field=document.getElementById('storyReview');\nfield.value=model.story;\nconst note=document.getElementById('note'),ink=document.getElementById('ink'),finish=document.getElementById('finish');\nfunction resizeField(){field.style.height='auto';field.style.height=Math.max(320,field.scrollHeight)+'px';}\nfunction update(){window.yosReviewedStory=field.value;ink.textContent=field.value;resizeField();}\nfield.addEventListener('input',()=>{update();if(note.classList.contains('finished')){note.classList.remove('finished');window.yosFinish=false;finish.textContent='書き終えた';}});\nfunction returnToEdit(){\n note.classList.remove('finished');window.yosFinish=false;finish.textContent='書き終えた';\n help.textContent='書き直したら、もう一度「書き終えた」';field.focus();\n}\nfinish.addEventListener('click',()=>{\n if(note.classList.contains('finished')){returnToEdit();return;}\n update();if(!field.value.trim()){field.focus();help.textContent='今日のことを一言だけ入力してね';return;}\n note.classList.add('finished');window.yosFinish=true;finish.textContent='編集する';\n help.textContent=model.mode==='compose'?'右上の完了で日記に仕上げる':'右上の完了で保存を確認';\n});\nnote.addEventListener('click',()=>{if(note.classList.contains('finished'))returnToEdit();});\ndocument.querySelectorAll('#moods button').forEach(b=>b.addEventListener('click',()=>{\n window.yosMood=window.yosMood===b.dataset.mood?'':b.dataset.mood;\n document.querySelectorAll('#moods button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mood===window.yosMood)));\n}));\nif(model.mood){document.querySelectorAll('#moods button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mood===model.mood)));}\nupdate();if(model.mode==='review')help.textContent='文章を確認したら「書き終えた」';\n</script></body></html>".replace('__DATA__',safeJSON);
// The image frame is optional. Tapping it, then closing the sheet, opens the
// native iPhone photo picker. The same paper page is then re-shown with the
// previous typed words intact; it never auto-selects unrelated gallery photos.
let reviewedStory='',didFinish=false,mood='',web;
let screenHTML=html,screenModel=model;
while(true){
  web=new WebView();await web.loadHTML(screenHTML);await web.present(false);
  try{reviewedStory=await web.evaluateJavaScript('window.yosReviewedStory');}
  catch(e){reviewedStory='';}
  try{didFinish=(await web.evaluateJavaScript('window.yosFinish'))===true;}catch(e){didFinish=false;}
  try{const m=await web.evaluateJavaScript('window.yosMood');mood=['満足','穏やか','ふつう','疲れた','つらい'].includes(m)?m:'';}catch(e){mood='';}
  let wantsPhoto=false;
  try{wantsPhoto=(await web.evaluateJavaScript('window.yosPickPhoto'))===true;}catch(e){}
  if(!wantsPhoto)break;
  // Picker requires the person's explicit tap. All image bytes stay on device.
  if(typeof Photos!=='undefined'&&typeof Photos.fromLibrary==='function'){
    try{
      const image=await Photos.fromLibrary();
      const dc=new DrawContext();dc.size=new Size(320,200);dc.opaque=true;
      dc.drawImageInRect(image,new Rect(0,0,320,200));
      const png=Data.fromPNG(dc.getImage()),base64=png.toBase64String();
      if(base64 && base64.length<400000){
        const fm=FileManager.local();
        const path=fm.joinPath(fm.documentsDirectory(),'YOS-Journal-Photo-'+input.date+'.png');
        fm.write(path,png);
        screenModel={...screenModel,story:reviewedStory,mood,photo:'data:image/png;base64,'+base64};
      }else screenModel={...screenModel,story:reviewedStory,mood};
    }catch(e){screenModel={...screenModel,story:reviewedStory,mood};}
  }else screenModel={...screenModel,story:reviewedStory,mood};
  const safe=JSON.stringify(screenModel).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  screenHTML=html.replace('const model='+safeJSON+';','const model='+safe+';');
}
if(typeof reviewedStory!=='string'||!reviewedStory.trim()||reviewedStory.length>8000||!didFinish){
  Script.complete(); // Closing an unfinished or blank journal never writes a record.
} else if(mode==='compose'){
  // Protect the raw words BEFORE handing them to Shortcuts. This backup is on-device,
  // in Scriptable's existing iCloud document storage; GitHub receives no journal data.
  // If an iCloud write cannot complete, try Scriptable's on-device local documents.
  let backedUp=false;
  try{
    const cloud=FileManager.iCloud();
    const path=cloud.joinPath(cloud.documentsDirectory(),'YOS-Journal-Compose-'+input.date+'-'+Date.now()+'.txt');
    cloud.writeString(path,reviewedStory);
    backedUp=true;
  }catch(e){}
  if(!backedUp){
    try{
      const local=FileManager.local();
      local.writeString(local.joinPath(local.documentsDirectory(),'YOS-Journal-Compose-'+input.date+'-'+Date.now()+'.txt'),reviewedStory);
      backedUp=true;
    }catch(e){}
  }
  if(backedUp&&reviewedStory.length<=500){
    // Apple Shortcuts documented URL format: app-to-app, not a network upload.
    // Re-run the EXISTING YOS 日記 by name with an explicit, private marker.
    const payload='YOS_JOURNAL_COMPOSE_V1:'+reviewedStory;
    Safari.open('shortcuts://run-shortcut?name='+encodeURIComponent('YOS 日記')+'&input=text&text='+encodeURIComponent(payload));
  }else{
    const a=new Alert();a.title='YOS 日記｜未保存';
    a.message=backedUp?'記録が長いため自動送信せずに保護しました。500字以内に短くしてください。':'記録の控えを端末に保存できなかったため、中断しました。';
    a.addAction('閉じる');await a.present();
  }
  Script.complete();
} else {
  if(!input.diary.includes(input.story)){throw new Error('YOS Journal Book: review source mismatch; nothing saved');}
  const storyAt=input.diary.indexOf(input.story);
  const reviewedDiary=input.diary.slice(0,storyAt)+reviewedStory+input.diary.slice(storyAt+input.story.length)+(mood?'\n\n【今日の気分】'+mood:'');
  const confirm=new Alert();confirm.title='YOS 日記｜保存';confirm.message='この記録を既存のNotionへ保存しますか？';confirm.addAction('保存する');confirm.addCancelAction('保存しない');
  const choice=await confirm.presentAlert();
  if(choice===0){const enc=v=>encodeURIComponent(Data.fromString(v).toBase64String());Safari.open('scriptable:///run?scriptName=YOS%20Journal%20Notion%20Bridge&date='+encodeURIComponent(input.date)+'&diary='+enc(reviewedDiary)+'&question='+enc(input.question)+'&answer='+enc(input.answer));}
  Script.complete();
}
