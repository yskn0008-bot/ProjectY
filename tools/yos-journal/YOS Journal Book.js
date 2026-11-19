// YOS Journal Book: verified date/memory preview on one textured-paper screen.
// iCloud Calendar and existing Notion Tasks are read-only; never infer real-world completion.
// Notion writing remains exclusively in the existing YOS Journal Notion Bridge.
const q=args.queryParameters||{};
const decode=k=>{try{const d=Data.fromBase64String(String(q[k]||''));return d?d.toRawString():'';}catch(e){return '';}};
const mode=q.mode==='compose'?'compose':'review';
const input={date:String(q.date||''),story:decode('story'),diary:decode('diary'),question:decode('question'),answer:decode('answer')};
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
const html = "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><style>\n:root{color-scheme:light;--ink:#432a1e;--muted:#967a5e;--gold:#b88b4b;--rule:#c9ac86}\n*{box-sizing:border-box}html,body{height:100%;margin:0}body{background:#24130e;font-family:\"Hiragino Mincho ProN\",\"Yu Mincho\",\"Hiragino Kaku Gothic ProN\",serif;color:var(--ink);overflow:hidden}\nbutton,textarea{font:inherit}button{cursor:pointer;-webkit-tap-highlight-color:transparent}\n.stage{height:100dvh;min-height:0;padding:8px 9px;background:radial-gradient(ellipse at 90% 6%,#874322 0,transparent 30%),repeating-linear-gradient(25deg,#352017 0 3px,#3c251a 4px 8px,#261710 10px 14px);border:1px solid #855b38;box-shadow:inset 0 0 0 4px #24130e,inset 0 0 0 6px #ad8356}\n.page{height:100%;overflow:hidden;position:relative;padding:clamp(14px,3.8vh,30px) clamp(14px,4vw,23px) clamp(10px,2.1vh,19px);border:1px solid #d6b790;border-radius:15px 24px 21px 12px;background:radial-gradient(ellipse at 94% 2%,#fff3de 0,transparent 47%),radial-gradient(circle at 23% 75%,#e9d0ad 0,transparent 62%),repeating-linear-gradient(2deg,transparent 0 3px,#b88e5d07 3.5px 4px),linear-gradient(105deg,#e4ccaa,#f8ebd5 11%,#f2dfc0 82%,#e5c49a);box-shadow:inset 7px 0 18px #78513223,inset -7px 0 8px #996b342a,0 4px 0 #b78e64,0 12px 28px #05020080;display:grid;grid-template-rows:auto minmax(168px,1fr) minmax(125px,.70fr) auto auto;gap:clamp(5px,1.1vh,12px)}\n.page:before{content:\"\";position:absolute;inset:0;opacity:.18;pointer-events:none;border-radius:inherit;background-image:repeating-radial-gradient(circle at 10% 30%,#9a6f4108 0 1px,transparent 1px 4px),repeating-radial-gradient(circle at 70% 60%,#744c240a 0 1px,transparent 2px 6px);mix-blend-mode:multiply}\n.page>*{position:relative;min-height:0}\n.header{display:grid;grid-template-columns:1fr 96px;gap:9px;border-bottom:1px solid var(--rule);padding-bottom:7px}\n.brand{font:700 clamp(20px,5.7vw,28px)/1.22 \"Hiragino Mincho ProN\",serif;letter-spacing:.04em;white-space:nowrap}\n.brand:before{content:\"✒\";font-size:24px;color:var(--gold);margin-right:7px}\n.tagline{font-size:9px;letter-spacing:.16em;color:#72523c;margin:5px 0 10px 6px}\n.date{font:italic clamp(25px,7vw,35px)/1 Georgia,serif;letter-spacing:.015em;white-space:nowrap}\n.date small{font:11px Georgia,serif;margin-left:8px;color:#87684d}\n.photocard{height:83px;align-self:center;transform:rotate(-4deg);padding:5px 5px 14px;background:#fff8eb;box-shadow:2px 3px 7px #5a3a2748;display:flex;align-items:center;justify-content:center;color:#af9273;font:9px Georgia,serif;text-align:center;overflow:hidden}\n.photocard{border:0;cursor:pointer}.photocard.real{padding:4px 4px 12px}.photocard img{width:100%;height:100%;object-fit:cover}\n.photocard.blank{background:linear-gradient(170deg,#fff7e7,#eedabd);border:1px solid #e6d1b5}\n.section-label{display:flex;align-items:center;gap:5px;font-size:clamp(12px,3.7vw,15px);font-weight:700;white-space:nowrap}\n.section-label span{font-size:17px;font-weight:400;color:#815c3b}\n.sub{font:italic 9px Georgia,serif;color:var(--muted);letter-spacing:.1em;margin:0 0 6px 23px}\n.middle{display:grid;grid-template-columns:53% 47%;border-bottom:1px solid var(--rule);padding:3px 0 6px}\n.timeline{padding-right:9px;border-right:1px solid #b68a5b66;display:flex;flex-direction:column;min-height:0}\n.highlights{padding-left:11px;display:flex;flex-direction:column;min-height:0}\n.events{list-style:none;margin:0;padding:0 0 0 5px;display:flex;flex-direction:column;flex:1;justify-content:space-evenly;min-height:0;overflow:hidden}\n.events li{display:flex;align-items:center;gap:5px;min-height:20px;border-left:1px solid #bea075;padding-left:5px;font-size:11px}\n.dot{flex:0 0 6px;width:6px;height:6px;border-radius:50%;background:#9d794a;margin-left:-9px;box-shadow:0 0 0 2px #f5e5cd}\n.events .time{font:10px Georgia,serif;color:#74573c;flex:0 0 36px}\n.events .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-weight:600}\n.events .status{font:8px sans-serif;color:#97785a;white-space:nowrap}\n.events li.done .status{color:#60724b}\n.events li.empty{border:0;line-height:1.6;padding:0;font-size:10px;color:#8d7156}\n.lede{font-size:11px;line-height:1.7;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;white-space:pre-wrap;word-break:break-word;flex:1}\n.lede.empty{color:#9b8065}\n.illustration{height:36px;border:1px solid #b88e573d;background:linear-gradient(165deg,#c6a16d17,transparent 58%),radial-gradient(circle at 70% 55%,#bd7b4741 0 8px,transparent 9px);margin-top:auto;transform:rotate(-2deg);font:italic 9px Georgia,serif;color:#ae8b69;display:flex;align-items:center;justify-content:center}\n.ink-area{display:flex;flex-direction:column;min-height:0}\n.note{flex:1;min-height:0;background:linear-gradient(transparent 90%,#b4906e38 91%) 0 0/100% 25px,linear-gradient(110deg,#f7e7c9,#ebd1ad6e);border:1px solid #d8bb96;border-radius:5px 3px 8px 4px;box-shadow:2px 3px 8px #9c71452e;padding:8px 10px;margin-top:6px}\n#storyReview{display:block;width:100%;height:100%;padding:0;background:transparent;border:0;outline:none;resize:none;color:#473021;line-height:1.7;font-size:12px;caret-color:#a8793f}\n#storyReview::placeholder{color:#aa8a66}\n#ink{display:none;font-size:12px;line-height:1.7;white-space:pre-wrap;max-height:100%;overflow:hidden;word-break:break-word}\n.note.finished #storyReview{display:none}.note.finished #ink{display:block}.note.finished{background:transparent;border-color:transparent;box-shadow:none}\n.mood{padding-top:2px;display:flex;align-items:center;justify-content:space-between;gap:8px}\n.mood-title{font-size:11px;font-weight:700;white-space:nowrap}\n.choices{display:flex;gap:clamp(7px,2vw,13px)}\n.mood button{border:1px solid #b89367;background:transparent;color:#765535;border-radius:50%;width:clamp(26px,7vw,32px);height:clamp(26px,7vw,32px);font:10px sans-serif}\n.mood button[aria-pressed=\"true\"]{background:#6c442b;color:#f8e5c6;border-color:#6c442b}\n.footer{display:flex;align-items:center;justify-content:space-between;gap:8px}\n#finish{padding:10px 23px;color:#f8e1b5;background:linear-gradient(#714429,#482619);border:1px solid #bd9255;border-radius:22px;box-shadow:0 2px 0 #2c160c;font-size:12px;letter-spacing:.12em;white-space:nowrap}\n.help{font-size:9px;line-height:1.5;color:#856b53;max-width:49%;text-align:right}\n@media(max-height:760px){.page{padding-top:14px;grid-template-rows:auto minmax(145px,1fr) minmax(108px,.65fr) auto auto;gap:4px}.header{padding-bottom:4px}.tagline{margin:2px 0 5px 6px}.photocard{height:63px}.sub{margin-bottom:3px}.note{margin-top:3px}.illustration{height:20px}.footer #finish{padding:8px 17px}}\n@media(max-width:350px){.page{padding-left:10px;padding-right:10px}.middle{grid-template-columns:51% 49%}.timeline{padding-right:5px}.highlights{padding-left:6px}.brand{font-size:18px}}\n/* Fixed physical-paper and leather samples cropped from approved YOS diary reference; all dates, entries, timeline and mood are dynamic. */.stage{background-image:linear-gradient(30deg,#24120a82,#57311d4d),url(data:image/webp;base64,UklGRnwBAABXRUJQVlA4IHABAADwCgCdASpQAFAAPplCmEioJCKiNHv4AQATCWNrh57lKLEcHdv/5/6IA3v8D2CnT4/EDNtzCNKrB7MQuUglhnsHRoVzAMjp8Wu3ww6B3h2oIW/QSv21c0QVXRTDTzwJGAAA/vUG68CvasoWq7fOiazAtXeIZUyOk/m5+Q2ExFZj70b8SAwYzQ25skawU2cvyQqfttLDFgb8TH1YQk+QkhqEX/6lbww/p/BGmvr8s8Yy9CItbtYXcFF1G7YRWbP0/j0gmlJBkcJiIbgA4Pw3+GsNOW2GdxghNG2I6avwNG5t8JyKLrPgXARSC8GDXHnvPtdLWO+GVLEaxOB5v/8rAp4Opj3WoP6LqagXEEJaVls4x6tVlm7EXcc860vf7MzMNMOIDFs/RlwYbswcnw1iIwhDNi5QfLMF3QJ9Fq4EnbUfGM/HfRPNXjwPkw79KEFL7qUZUvIzR4w8cHhlodmf46wq4KMkq53xFIg3Hehe6D8AAA==);background-size:cover,80px 80px}.page{background-image:linear-gradient(104deg,#f4e2c94d,#f4e2c92e),url(data:image/webp;base64,UklGRrIAAABXRUJQVlA4IKYAAAAwBQCdASpQAFAAPqFQn02mJKMiIUsAwBQJaWuU8QRaEBROkB53Xgw0rgn2ajDUmdNGYAD+8bHv4wmkYDCbstEEHw1Krh5DIpEAcUq0bkLeeWCiwbV/YZ+HBSwT+ji30hfK94PWOJyPAl0JlXd6zDUIDzXG4npgtWZBjoxVoddckJq5LsGjti9ZfFRAzm8nKMqffPHIlXLMrg6gWv/dgYxYFkMl6zgA);background-size:cover,80px 80px}</style></head><body><div class=\"stage\"><main class=\"page\">\n<header class=\"header\"><div><div class=\"brand\">YOS 日記</div><div class=\"tagline\">今日を短く、深く残す</div><div class=\"date\" id=\"date\"></div></div><button type=\"button\" class=\"photocard blank\" id=\"photo\" aria-label=\"今日の写真を選ぶ\">写真を選ぶ</button></header>\n<section class=\"middle\">\n<div class=\"timeline\"><div class=\"section-label\"><span>▤</span>今日の流れ</div><div class=\"sub\">Daily timeline</div><ul class=\"events\" id=\"events\"></ul></div>\n<div class=\"highlights\"><div class=\"section-label\"><span>✧</span>心に残ったこと</div><div class=\"sub\">Today's memory</div><div class=\"lede\" id=\"lede\"></div><div class=\"illustration\">YOS  ·  A DAY TO REMEMBER</div></div>\n</section>\n<section class=\"ink-area\"><div class=\"section-label\"><span>✎</span>今日の記録</div><div class=\"sub\">Diary note</div><div class=\"note\" id=\"note\"><textarea id=\"storyReview\" maxlength=\"8000\" aria-label=\"今日の記録\" placeholder=\"今日いちばん残したいことを一言\"></textarea><div id=\"ink\"></div></div></section>\n<section class=\"mood\"><span class=\"mood-title\">♡ 今日の気分</span><div class=\"choices\" id=\"moods\"><button type=\"button\" data-mood=\"満足\" aria-pressed=\"false\">満</button><button type=\"button\" data-mood=\"穏やか\" aria-pressed=\"false\">穏</button><button type=\"button\" data-mood=\"ふつう\" aria-pressed=\"false\">普</button><button type=\"button\" data-mood=\"疲れた\" aria-pressed=\"false\">疲</button><button type=\"button\" data-mood=\"つらい\" aria-pressed=\"false\">辛</button></div></section>\n<footer class=\"footer\"><button type=\"button\" id=\"finish\">書き終えた</button><span class=\"help\" id=\"help\">一言入力後、「書き終えた」を押す</span></footer>\n</main></div><script>\nconst model=__DATA__;window.yosReviewedStory=model.story;window.yosMood=model.mood||'';window.yosFinish=false;window.yosPickPhoto=false;\nconst d=new Date(model.date+'T12:00:00');const months=['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];const days=['Sun.','Mon.','Tue.','Wed.','Thu.','Fri.','Sat.'];\ndocument.getElementById('date').textContent=months[d.getMonth()]+' '+d.getDate()+' ';let ds=document.createElement('small');ds.textContent=days[d.getDay()];document.getElementById('date').append(ds);\nconst events=document.getElementById('events');\nif(!model.timeline.length){const li=document.createElement('li');li.className='empty';li.textContent=model.emptyMessage;events.append(li);}\nmodel.timeline.forEach(e=>{const li=document.createElement('li');li.className=e.done?'done':'';const dot=document.createElement('span');dot.className='dot';const time=document.createElement('span');time.className='time';time.textContent=e.time;const title=document.createElement('span');title.className='name';title.textContent=e.title;const status=document.createElement('span');status.className='status';status.textContent=e.done?'完了':'予定';li.append(dot,time,title,status);events.append(li);});\ndocument.getElementById('lede').textContent=model.story.trim()||'まだ今日の記録はありません';\ndocument.getElementById('lede').classList.toggle('empty',!model.story.trim());\nconst photo=document.getElementById('photo');if(model.photo){photo.classList.replace('blank','real');photo.textContent='';const img=document.createElement('img');img.src=model.photo;img.alt='提供された写真';photo.append(img);}\nphoto.addEventListener('click',()=>{window.yosPickPhoto=true;const label=document.getElementById('help');label.textContent='右上の完了で写真を選べます';});\nconst field=document.getElementById('storyReview');field.value=model.story;const note=document.getElementById('note'),ink=document.getElementById('ink'),help=document.getElementById('help'),finish=document.getElementById('finish');\nfunction update(){window.yosReviewedStory=field.value;ink.textContent=field.value;if(model.mode==='compose'){document.getElementById('lede').textContent=field.value||'どんな気持ちになったか、一言だけでも残そう';}}\nfield.addEventListener('input',()=>{update();if(note.classList.contains('finished'))note.classList.remove('finished');});\nfinish.addEventListener('click',()=>{\n  if(note.classList.contains('finished')){note.classList.remove('finished');window.yosFinish=false;finish.textContent='書き終えた';help.textContent='書き直したらもう一度「書き終えた」';field.focus();return;}\n  update();if(!field.value.trim()){field.focus();help.textContent='記録を一言入力してください';return;}\n  note.classList.add('finished');window.yosFinish=true;finish.textContent='編集する';\n  help.textContent=model.mode==='compose'?'右上の完了で日記に仕上げます':'右上の完了で保存を確認';\n});\nnote.addEventListener('click',()=>{if(note.classList.contains('finished')){note.classList.remove('finished');window.yosFinish=false;finish.textContent='書き終えた';field.focus();}});\ndocument.querySelectorAll('#moods button').forEach(b=>b.addEventListener('click',()=>{window.yosMood=(window.yosMood===b.dataset.mood?'':b.dataset.mood);document.querySelectorAll('#moods button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mood===window.yosMood)));}));\nupdate();if(model.mode==='review'){help.textContent='書き終えたら右上の完了で保存確認';}if(model.mood){document.querySelectorAll('#moods button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mood===model.mood)));}\n</script></body></html>".replace('__DATA__',safeJSON);
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
