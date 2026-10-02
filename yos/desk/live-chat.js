'use strict';

(function(){
  var ASSETS_URL='../../data/yos-assets.json';
  var YOS_AI_FALLBACK='https://project-y-yos-ai.vercel.app';
  var THREAD_LIMIT=120;
  var PROGRESS_COPY_VERSION='friendly-v1';
  var activeThreadId='';
  var sending=false;
  var lastAnimatedMessageId='';
  var authRetrying=false;
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
  function latestConversation(chatId){
    var items=thread(chatId);
    for(var i=items.length-1;i>=0;i--){
      if(items[i]&&(items[i].role==='user'||items[i].role==='assistant'))return items[i];
    }
    return null;
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
    var text=clean(message.text,90).replace(/\s+/g,' ');
    if(message.role==='user')return'あなた：'+text;
    if(message.role==='assistant')return'YOS：'+text;
    return text;
  }
  function updateChatFromThread(chat){
    var item=latestConversation(chat.id)||latest(chat.id);
    if(!item)return;
    chat.preview=messagePreview(item);
    chat.time=listTime(item.at);
  }
  function pushMessage(chatId,message){
    var items=thread(chatId);
    var entry={
      id:message.id||uid('msg'),
      role:message.role||'system',
      kind:message.kind||'message',
      text:clean(message.text,6000),
      at:message.at||new Date().toISOString(),
      requestId:clean(message.requestId,180),
      progress:Number.isFinite(Number(message.progress))?Number(message.progress):null
    };
    items.push(entry);
    lastAnimatedMessageId=entry.id;
    if(items.length>THREAD_LIMIT)state.chatThreads[chatId]=items.slice(-THREAD_LIMIT);
    var chat=state.chats.find(function(x){return x.id===chatId});
    if(chat)updateChatFromThread(chat);
    persist();
  }
  function plainText(value){
    return clean(value,900)
      .replace(/iPhone実機/g,'iPhone')
      .replace(/E2E/g,'最初から最後までの確認')
      .replace(/PASS/g,'成功')
      .replace(/SSOT/g,'最新データ')
      .replace(/CI/g,'自動テスト')
      .replace(/Router/g,'振り分け')
      .replace(/Verify/g,'結果確認')
      .replace(/Ledger/g,'記録')
      .replace(/destination→APPLIED→REQUEST_DONE/g,'目的地を受け取って処理完了まで');
  }
  function firstSentences(value,max){
    var text=plainText(value).replace(/\s+/g,' ').trim();
    if(!text)return'';
    var parts=text.match(/[^。！？!?]+[。！？!?]?/g)||[text];
    var out='';
    for(var i=0;i<parts.length;i++){
      var part=String(parts[i]||'').trim();
      if(!part)continue;
      if(out&&out.length+part.length>max)break;
      if(!out&&part.length>max){out=part;break}
      out+=part;
    }
    return out||text;
  }
  function progressText(asset){
    var progress=Number(asset.progress||0);
    if(asset.id==='clarity'){
      if(progress>=100){
        return ['いま','Clarityは完成しています。普段どおり使って大丈夫です。','','次','使っていて困るところが出た時だけ直します。'].join('\n');
      }
      if(progress>=85){
        return ['いま','iPhoneで一通り動くところまで確認できています。','','残っていること','普段使いで問題が出ないかの最終確認です。','','次','実際に使いながら問題がないか確認します。'].join('\n');
      }
      if(progress>=65){
        return ['いま','予定の登録と、Googleマップでナビを始めるところまでは動いています。','','残っていること','まだ全部の操作をまとめて確認できていません。','','次','iPhoneで残りをまとめて確認します。全部通れば進捗は85%になります。'].join('\n');
      }
    }
    var current=firstSentences(asset.current,150);
    var next=firstSentences(asset.next_action,130);
    var lines=['いま'];
    lines.push(current||statusText(asset.status)+'です。');
    if(next){
      lines.push('','次',next);
    }
    return lines.join('\n');
  }
  function migrateProgressCopy(){
    if(state.chatProgressCopyVersion===PROGRESS_COPY_VERSION)return;
    ROOM_DEFS.forEach(function(def){
      if(Array.isArray(state.chatThreads[def.id])){
        state.chatThreads[def.id]=state.chatThreads[def.id].filter(function(message){
          return message&&message.kind!=='progress';
        });
      }
      delete state.assetThreadVersions[def.assetId];
    });
    state.chatProgressCopyVersion=PROGRESS_COPY_VERSION;
    persist();
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
    q('#threadBack').onclick=function(){
      var chat=state.chats.find(function(x){return x.id===activeThreadId});
      if(chat&&chat.temporary){
        var id=chat.id;
        state.chats=state.chats.filter(function(x){return x.id!==id});
        delete state.chatThreads[id];
        if(state.activeChatId===id)state.activeChatId='';
        persist();
      }
      var reduced=globalThis.matchMedia&&globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduced){setPage('chats');return}
      document.body.classList.add('thread-closing');
      setTimeout(function(){
        document.body.classList.remove('thread-closing');
        setPage('chats');
      },170);
    };
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
    var bulk=q('#bulk');
    if(bulk)bulk.style.display=on?'none':(selecting?'grid':'none');
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
    if(message.id===lastAnimatedMessageId)klass+=' message-enter';
    var label=progress
      ?'<div class="messageLabel">いまの状況</div>'
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
      :(chat.temporary?'一時チャット · 履歴に残しません':(chat.url?'ChatGPT実チャット':'YOS AI'));
    q('#threadExternal').hidden=!chat.url;
    q('#threadExternal').title=chat.url?'ChatGPTを開く':'';
    var items=thread(chat.id);
    q('#messageStream').innerHTML=items.map(messageHtml).join('')+
      (sending?'<div class="messageRow ai message-enter"><div class="messageBubble typing"><span></span><span></span><span></span></div></div>':'');
    lastAnimatedMessageId='';
    requestAnimationFrame(function(){
      var stream=q('#messageStream');
      stream.scrollTo({top:stream.scrollHeight,behavior:'smooth'});
    });
  }
  function openThread(id){
    var chat=state.chats.find(function(x){return x.id===id});
    if(!chat)return;
    activeThreadId=id;
    chat.unread=0;
    state.activeChatId=id;
    persist();
    setPage('thread');
  }
  function createLiveChat(options){
    options=options||{};
    var temporary=Boolean(options.temporary);
    var id=uid(temporary?'temp-chat':'yos-chat');
    var chat={
      id:id,
      project:'YOS',
      title:temporary?'一時チャット':'新しいチャット',
      preview:temporary?'この会話は履歴に残りません':'メッセージを送って会話を始める',
      time:'',
      unread:0,
      pinned:false,
      avatar:'Y',
      tone:'gold',
      alias:'',
      url:'',
      liveAi:true,
      temporary:temporary,
      autoTitle:!temporary
    };
    state.chats.unshift(chat);
    state.chatThreads[id]=[];
    openThread(id);
    return id;
  }
  globalThis.yosDeskCreateChat=createLiveChat;
  globalThis.yosDeskOpenThread=openThread;

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
    if(activeThreadId||currentPage==='thread')setThreadVisible(true);
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
    var parts=['YOS Chat',chat?titleOf(chat):''];
    if(asset&&asset.current)parts.push(clean(asset.current,180));
    return clean(parts.filter(Boolean).join('｜'),300);
  }
  function aiErrorMessage(error){
    var status=Number(error&&error.status)||0;
    if(status===401)return'本人確認できませんでした。GoogleでYOS用のアカウントを選んでください。';
    if(status===403)return'YOSへの接続設定を確認しています。送った内容は残っています。';
    if(status===429)return'少し混み合っています。送った内容は残っています。';
    if(status===503)return'YOS側で返事を作れませんでした。送った内容は残っています。';
    return'返事を受け取れませんでした。送った内容は残っています。';
  }
  async function chatWithAuthRetry(client,payload){
    try{
      return await client.chat(payload);
    }catch(error){
      var status=Number(error&&error.status)||0;
      var reset=globalThis.YOS_AUTH&&globalThis.YOS_AUTH.resetGoogleIdToken;
      if(status!==401||authRetrying||typeof reset!=='function')throw error;
      authRetrying=true;
      try{
        reset();
        renderThread();
        return await client.chat(payload);
      }finally{
        authRetrying=false;
      }
    }
  }
  async function sendThreadMessage(){
    if(sending||!activeThreadId)return;
    var input=q('#threadInput');
    var text=clean(input.value,10000);
    if(!text)return;
    var chat=state.chats.find(function(x){return x.id===activeThreadId});
    if(!chat)return;
    var previousSummary=summaryBeforeSend(chat.id);
    if(chat.autoTitle){
      var inferredTitle=text.replace(/\s+/g,' ').trim();
      if(inferredTitle.length>28)inferredTitle=inferredTitle.slice(0,28)+'…';
      if(inferredTitle)chat.title=inferredTitle;
      chat.autoTitle=false;
    }
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
      var client=new Client({
        baseUrl:base,
        getGoogleIdToken:getToken,
        vercelShareToken:clean(globalThis.YOS_VERCEL_SHARE_TOKEN||'',512)
      });
      var payload={userText:text,currentLocation:locationForChat(chat)};
      if(previousSummary)payload.conversationSummary=previousSummary;
      var result=await chatWithAuthRetry(client,payload);
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
  migrateProgressCopy();
  ensureBaseRooms();
  document.documentElement.dataset.deskLiveChat='ready';
  document.documentElement.dataset.deskChatMode='live';
  renderChats();
  syncRooms();
  setInterval(syncRooms,30000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)syncRooms()});
})();
