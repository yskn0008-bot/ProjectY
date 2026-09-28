'use strict';

(function(){
  var ASSETS_URL='../../data/yos-assets.json';
  var YOS_AI_FALLBACK='https://project-y-yos-ai.vercel.app';
  var THREAD_LIMIT=120;
  var activeThreadId='';
  var sending=false;
  var assetsById={};
  var ROOM_DEFS=[
    {id:'asset-yos',assetId:'yos',title:'YOS',avatar:'Y',tone:'gold',pinned:true},
    {id:'asset-clarity',assetId:'clarity',title:'Clarity',avatar:'C',tone:'blue',pinned:true},
    {id:'asset-money',assetId:'money',title:'Money',avatar:'¥',tone:'green',pinned:true},
    {id:'asset-my-way',assetId:'my-way',title:'MY WAY',avatar:'M',tone:'gold',pinned:false},
    {id:'asset-life',assetId:'life',title:'MY LIFE',avatar:'L',tone:'coral',pinned:false}
  ];

  state.chatThreads=state.chatThreads&&typeof state.chatThreads==='object'?state.chatThreads:{};
  state.assetThreadVersions=state.assetThreadVersions&&typeof state.assetThreadVersions==='object'?state.assetThreadVersions:{};

  function uid(prefix){
    return (prefix||'m')+'-'+(globalThis.crypto&&globalThis.crypto.randomUUID?globalThis.crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2));
  }
  function clean(value,max){
    return String(value==null?'':value).trim().slice(0,max||4000);
  }
  function statusText(value){
    return {
      complete:'完了',
      awaiting_device_verification:'実機確認待ち',
      awaiting_production_verification:'本番確認待ち',
      building:'開発中',
      planned:'予定',
      blocked:'停止中',
      active:'進行中',
      review:'確認中',
      paused:'停止中',
      backlog:'未着手'
    }[String(value||'')]||String(value||'更新中');
  }
  function thread(chatId){
    if(!Array.isArray(state.chatThreads[chatId]))state.chatThreads[chatId]=[];
    return state.chatThreads[chatId];
  }
  function latest(chatId){
    var items=thread(chatId);
    return items.length?items[items.length-1]:null;
  }
  function japanTime(value){
    var d=value?new Date(value):new Date();
    if(Number.isNaN(d.getTime()))d=new Date();
    return new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(d);
  }
  function listTime(value){
    var d=value?new Date(value):new Date();
    if(Number.isNaN(d.getTime()))return'';
    var now=new Date();
    var day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(d);
    var today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(now);
    if(day===today)return japanTime(d);
    return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',timeZone:'Asia/Tokyo'}).format(d);
  }
  function messagePreview(message){
    if(!message)return'';
    return clean(message.text,90).replace(/\s+/g,' ');
  }
  function updateChatFromThread(chat){
    var item=latest(chat.id);
    if(!item)return;
    chat.preview=messagePreview(item);
    chat.time=listTime(item.at);
  }
  function pushMessage(chatId,message){
    var items=thread(chatId);
    items.push({
      id:message.id||uid('msg'),
      role:message.role||'system',
      kind:message.kind||'message',
      text:clean(message.text,6000),
      at:message.at||new Date().toISOString(),
      requestId:clean(message.requestId,180),
      progress:Number.isFinite(Number(message.progress))?Number(message.progress):null
    });
    if(items.length>THREAD_LIMIT)state.chatThreads[chatId]=items.slice(-THREAD_LIMIT);
    var chat=state.chats.find(function(x){return x.id===chatId});
    if(chat)updateChatFromThread(chat);
    persist();
  }
  function progressText(asset){
    var lines=['進捗 '+Number(asset.progress||0)+'%','状態：'+statusText(asset.status)];
    if(asset.current)lines.push('',clean(asset.current,1200));
    if(asset.next_action)lines.push('','次：'+clean(asset.next_action,1000));
    return lines.join('\n');
  }
  function ensureRoom(def,asset){
    var chat=state.chats.find(function(x){return x.assetId===def.assetId||x.id===def.id});
    if(!chat){
      chat={
        id:def.id,assetId:def.assetId,project:'YOS',title:def.title,
        preview:'進捗を同期中',time:'',unread:0,pinned:def.pinned,
        avatar:def.avatar,tone:def.tone,alias:'',url:'',liveAi:true
      };
      state.chats.push(chat);
    }
    chat.assetId=def.assetId;
    chat.liveAi=true;
    chat.title=def.title;
    chat.project='YOS';
    chat.avatar=def.avatar;
    chat.tone=def.tone;
    if(typeof chat.pinned!=='boolean')chat.pinned=def.pinned;
    if(!asset){
      updateChatFromThread(chat);
      return chat;
    }
    assetsById[asset.id]=asset;
    var version=[
      asset.updated_at||'',asset.progress||0,asset.status||'',
      asset.current||'',asset.next_action||''
    ].join('|');
    var previous=state.assetThreadVersions[asset.id]||'';
    if(previous!==version){
      var first=!previous;
      pushMessage(chat.id,{
        role:'system',kind:'progress',text:progressText(asset),
        at:asset.updated_at||new Date().toISOString(),
        progress:Number(asset.progress)||0
      });
      state.assetThreadVersions[asset.id]=version;
      if(!first&&activeThreadId!==chat.id)chat.unread=(Number(chat.unread)||0)+1;
    }
    updateChatFromThread(chat);
    return chat;
  }
  function ensureBaseRooms(){
    ROOM_DEFS.forEach(function(def){ensureRoom(def,null)});
    persist();
  }
  async function syncRooms(){
    try{
      var res=await fetch(ASSETS_URL+'?t='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw new Error('asset '+res.status);
      var data=await res.json();
      var byId={};
      (Array.isArray(data.assets)?data.assets:[]).forEach(function(asset){byId[asset.id]=asset});
      ROOM_DEFS.forEach(function(def){ensureRoom(def,byId[def.assetId]||null)});
      persist();
      renderChats();
      if(activeThreadId)renderThread();
      document.documentElement.dataset.deskChatSync='ok';
    }catch(e){
      ensureBaseRooms();
      renderChats();
      document.documentElement.dataset.deskChatSync='local';
    }
  }

  function buildThreadPage(){
    if(q('#threadPage'))return;
    var page=document.createElement('section');
    page.className='page';
    page.id='threadPage';
    page.innerHTML=
      '<header class="threadTop">'+
        '<button class="threadBack" id="threadBack" type="button" aria-label="チャット一覧へ戻る">‹</button>'+
        '<div class="threadAvatar" id="threadAvatar">Y</div>'+
        '<div class="threadIdentity"><strong id="threadTitle">YOS</strong><span id="threadStatus">進捗同期</span></div>'+
        '<button class="threadExternal" id="threadExternal" type="button" hidden>↗</button>'+
      '</header>'+
      '<div class="messageStream" id="messageStream" aria-live="polite"></div>'+
      '<div class="googleSignIn" id="googleSignIn" hidden><p>最初の1回だけGoogleで本人確認します。認証情報は保存しません。</p><div id="googleSignInButton"></div></div>'+
      '<form class="threadComposer" id="threadComposer">'+
        '<textarea id="threadInput" rows="1" maxlength="10000" placeholder="メッセージ"></textarea>'+
        '<button id="threadSend" type="submit">送信</button>'+
      '</form>';
    q('#app').appendChild(page);
    q('#threadBack').onclick=function(){setPage('chats')};
    q('#threadExternal').onclick=function(){
      var chat=state.chats.find(function(x){return x.id===activeThreadId});
      if(chat&&chat.url)location.href=chat.url;
    };
    q('#threadComposer').addEventListener('submit',function(event){
      event.preventDefault();
      sendThreadMessage();
    });
    q('#threadInput').addEventListener('input',function(){
      this.style.height='auto';
      this.style.height=Math.min(112,Math.max(44,this.scrollHeight))+'px';
    });
  }
  function setThreadVisible(on){
    document.body.classList.toggle('thread-open',Boolean(on));
    q('#bottom').style.display=on?'none':(selecting?'none':'grid');
    q('#bulk').style.display=on?'none':(selecting?'grid':'none');
  }
  var baseSetPage=setPage;
  setPage=function(name){
    if(name==='thread'){
      qa('.page').forEach(function(p){p.classList.remove('active')});
      q('#threadPage').classList.add('active');
      currentPage='thread';
      setThreadVisible(true);
      renderThread();
      return;
    }
    activeThreadId='';
    setThreadVisible(false);
    baseSetPage(name);
  };

  function messageHtml(message){
    var mine=message.role==='user';
    var ai=message.role==='assistant';
    var progress=message.kind==='progress';
    var error=message.kind==='error';
    var klass=mine?'mine':ai?'ai':progress?'progress':'system';
    if(error)klass+=' error';
    var label=progress
      ?'<div class="messageLabel">進捗更新'+(message.progress!==null?' · '+esc(message.progress)+'%':'')+'</div>'
      :'';
    return '<div class="messageRow '+klass+'">'+
      '<div class="messageBubble">'+label+'<div class="messageText">'+esc(message.text).replace(/\n/g,'<br>')+'</div>'+
      '<div class="messageTime">'+esc(japanTime(message.at))+'</div></div></div>';
  }
  function renderThread(){
    if(!activeThreadId)return;
    var chat=state.chats.find(function(x){return x.id===activeThreadId});
    if(!chat)return;
    var asset=chat.assetId?assetsById[chat.assetId]:null;
    q('#threadTitle').textContent=titleOf(chat);
    q('#threadAvatar').textContent=chat.avatar||'Y';
    q('#threadAvatar').className='threadAvatar '+(chat.tone||'');
    q('#threadStatus').textContent=asset
      ?statusText(asset.status)+' · '+Number(asset.progress||0)+'%'
      :(chat.url?'ChatGPT実チャット':'YOS AI');
    q('#threadExternal').hidden=!chat.url;
    q('#threadExternal').title=chat.url?'ChatGPTを開く':'';
    var items=thread(chat.id);
    q('#messageStream').innerHTML=items.map(messageHtml).join('')+
      (sending?'<div class="messageRow ai"><div class="messageBubble typing"><span></span><span></span><span></span></div></div>':'');
    requestAnimationFrame(function(){
      var stream=q('#messageStream');
      stream.scrollTop=stream.scrollHeight;
    });
  }
  function openThread(id){
    var chat=state.chats.find(function(x){return x.id===id});
    if(!chat)return;
    activeThreadId=id;
    chat.unread=0;
    persist();
    setPage('thread');
  }

  var baseRenderChats=renderChats;
  renderProjects=function(){
    projectFilter='すべて';
    var holder=q('#projects');
    holder.innerHTML='';
    holder.style.display='none';
  };
  renderChats=function(){
    state.chats.forEach(updateChatFromThread);
    baseRenderChats();
    var head=q('#chatList')&&q('#chatList').parentElement&&q('#chatList').parentElement.querySelector('.sectionHead span');
    if(head)head.textContent='進捗とメッセージを自動更新';
  };
  bindChats=function(){
    qa('.chat').forEach(function(row){
      var id=row.dataset.id,timer=null,longPressed=false;
      row.onclick=function(){
        tap();
        if(longPressed){longPressed=false;return}
        if(selecting){selected.has(id)?selected.delete(id):selected.add(id);renderChats();return}
        var chat=state.chats.find(function(x){return x.id===id});
        if(!chat)return;
        if(chat.liveAi||chat.assetId){openThread(id);return}
        if(chat.url){location.href=chat.url;return}
        openChatSheet(id);
      };
      row.addEventListener('touchstart',function(){
        longPressed=false;
        timer=setTimeout(function(){longPressed=true;openChatSheet(id)},500);
      },{passive:true});
      row.addEventListener('touchmove',function(){clearTimeout(timer)},{passive:true});
      row.addEventListener('touchend',function(){clearTimeout(timer)},{passive:true});
    });
  };

  var baseOpenChatSheet=openChatSheet;
  openChatSheet=function(id){
    var chat=state.chats.find(function(x){return x.id===id});
    if(!chat||!chat.assetId){baseOpenChatSheet(id);return}
    currentChatId=id;
    var asset=assetsById[chat.assetId];
    var html='<h3>'+esc(titleOf(chat))+'</h3>'+
      '<p>'+(asset?esc(statusText(asset.status)+' · '+asset.progress+'%'):'進捗同期中')+'</p>'+
      '<button class="primary" id="openThreadFromSheet">トークを開く</button>'+
      '<button id="togglePin">'+(chat.pinned?'固定を外す':'固定する')+'</button>'+
      '<button id="closeSheetBtn">閉じる</button>';
    showSheet(html);
    q('#openThreadFromSheet').onclick=function(){closeSheet();openThread(id)};
    q('#togglePin').onclick=function(){chat.pinned=!chat.pinned;closeSheet();renderChats()};
    q('#closeSheetBtn').onclick=closeSheet;
  };

  function summaryBeforeSend(chatId){
    var items=thread(chatId).filter(function(x){return x.role==='user'||x.role==='assistant'}).slice(-12);
    var text=items.map(function(x){return (x.role==='user'?'本人':'YOS')+'：'+clean(x.text,800)}).join('\n');
    return clean(text,12000);
  }
  function locationForChat(chat){
    var asset=chat&&chat.assetId?assetsById[chat.assetId]:null;
    var parts=['YOS DESK',chat?titleOf(chat):''];
    if(asset&&asset.current)parts.push(clean(asset.current,180));
    return clean(parts.filter(Boolean).join('｜'),300);
  }
  function aiErrorMessage(error){
    var status=Number(error&&error.status)||0;
    if(status===401)return'Google本人確認が必要です。もう一度送信してください。';
    if(status===403)return'このYOS DESKからYOS AIへ接続できません。';
    if(status===429)return'少し時間を空けてから、もう一度送信してください。';
    if(status===503)return'YOS AIへ接続できません。メッセージは端末に残しています。';
    return'送信できませんでした。メッセージは端末に残しています。';
  }
  async function sendThreadMessage(){
    if(sending||!activeThreadId)return;
    var input=q('#threadInput');
    var text=clean(input.value,10000);
    if(!text)return;
    var chat=state.chats.find(function(x){return x.id===activeThreadId});
    if(!chat)return;
    var previousSummary=summaryBeforeSend(chat.id);
    input.value='';
    input.style.height='44px';
    pushMessage(chat.id,{role:'user',text:text,at:new Date().toISOString()});
    sending=true;
    renderThread();
    try{
      var Client=globalThis.YosAiClient;
      var getToken=globalThis.YOS_AUTH&&globalThis.YOS_AUTH.getGoogleIdToken;
      if(typeof Client!=='function'||typeof getToken!=='function')throw Object.assign(new Error('YOS AI client unavailable'),{status:503});
      var base=clean(globalThis.YOS_AI_BASE_URL||YOS_AI_FALLBACK,500);
      var client=new Client({baseUrl:base,getGoogleIdToken:getToken});
      var payload={userText:text,currentLocation:locationForChat(chat)};
      if(previousSummary)payload.conversationSummary=previousSummary;
      var result=await client.chat(payload);
      var answer=clean(result&&result.answer,6000)||'回答を受け取りました。';
      if(result&&result.safety&&result.safety.level&&result.safety.level!=='normal'&&Array.isArray(result.safety.notes)&&result.safety.notes.length){
        answer+='\n\n'+result.safety.notes.map(function(x){return clean(x,500)}).filter(Boolean).join(' ');
      }
      pushMessage(chat.id,{role:'assistant',text:answer,at:new Date().toISOString(),requestId:result&&result.requestId});
    }catch(error){
      pushMessage(chat.id,{role:'system',kind:'error',text:aiErrorMessage(error),at:new Date().toISOString()});
    }finally{
      sending=false;
      renderThread();
      renderChats();
    }
  }

  buildThreadPage();
  ensureBaseRooms();
  document.documentElement.dataset.deskLiveChat='ready';
  renderChats();
  syncRooms();
  setInterval(syncRooms,30000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)syncRooms()});
})();
