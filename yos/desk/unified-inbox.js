'use strict';

(function(){
  var ACTIVE_FIELD='activeChatId';

  function isChatGpt(chat){
    return Boolean(chat&&/^https:\/\/chatgpt\.com\//.test(String(chat.url||'').trim()));
  }
  function isSharedSnapshot(chat){
    return isChatGpt(chat)&&/\/share\//.test(String(chat.url||''));
  }
  function sourceText(chat){
    if(isSharedSnapshot(chat))return 'GPT共有';
    if(isChatGpt(chat))return 'GPT原文';
    return 'YOS';
  }
  function normalize(chat){
    if(!chat||typeof chat!=='object')return chat;
    if(!Number.isFinite(Number(chat.unread)))chat.unread=0;
    chat.unread=Math.max(0,Number(chat.unread)||0);
    if(!chat.source)chat.source=isChatGpt(chat)?'chatgpt':'yos';
    return chat;
  }
  function activeChat(){
    return (state.chats||[]).find(function(chat){return chat.id===state[ACTIVE_FIELD]})||null;
  }
  function markActive(id){
    var chat=(state.chats||[]).find(function(item){return item.id===id});
    if(!chat)return;
    state[ACTIVE_FIELD]=id;
    chat.unread=0;
    chat.lastOpenedAt=new Date().toISOString();
    persist();
  }
  globalThis.yosDeskMarkActive=markActive;

  (state.chats||[]).forEach(normalize);
  if(state[ACTIVE_FIELD]&&!activeChat())state[ACTIVE_FIELD]='';
  persist();

  if(typeof filteredChats==='function'){
    var baseFilteredChats=filteredChats;
    filteredChats=function(){
      var rows=baseFilteredChats();
      var activeId=state[ACTIVE_FIELD]||'';
      return rows
        .map(function(chat,index){return {chat:chat,index:index}})
        .sort(function(a,b){
          var aa=a.chat.id===activeId?1:0;
          var bb=b.chat.id===activeId?1:0;
          if(aa!==bb)return bb-aa;
          return a.index-b.index;
        })
        .map(function(item){return item.chat});
    };
  }

  function ensureSourceSummary(){
    var page=q('#chatsPage');
    if(!page)return null;
    var box=q('#sourceSummary');
    if(box)return box;
    box=document.createElement('div');
    box.id='sourceSummary';
    box.className='sourceSummary';
    var tabs=q('#chatsPage .tabs');
    if(tabs&&tabs.parentNode)tabs.parentNode.insertBefore(box,tabs.nextSibling);
    return box;
  }

  function decorateSourceSummary(){
    var box=ensureSourceSummary();
    if(!box)return;
    var gpt=(state.chats||[]).filter(isChatGpt).length;
    var yos=(state.chats||[]).length-gpt;
    box.innerHTML=
      '<div class="sourceSummaryText">'+
        '<strong>GPT原文 '+gpt+'</strong><span>YOS内 '+yos+'</span>'+
      '</div>'+
      '<button type="button" id="addGptChatBtn">＋ GPT原文</button>';
    var add=q('#addGptChatBtn');
    if(add)add.onclick=function(){
      tap();
      if(typeof addClipboardChat==='function')addClipboardChat();
      else if(typeof openNew==='function')openNew();
    };
  }

  function ensureCurrentBanner(){
    var page=q('#chatsPage');
    if(!page)return null;
    var banner=q('#currentChatBanner');
    if(banner)return banner;
    banner=document.createElement('button');
    banner.type='button';
    banner.id='currentChatBanner';
    banner.className='currentChatBanner';
    var tabs=q('#chatsPage .tabs');
    if(tabs&&tabs.parentNode)tabs.parentNode.insertBefore(banner,tabs.nextSibling);
    banner.addEventListener('click',function(){
      var chat=activeChat();
      if(!chat)return;
      var row=q('.chat[data-id="'+CSS.escape(chat.id)+'"]');
      if(row){row.click();return}
      markActive(chat.id);
      if(chat.url)location.href=chat.url;
    });
    return banner;
  }

  function decorateCurrentBanner(){
    var banner=ensureCurrentBanner();
    if(!banner)return;
    var chat=activeChat();
    if(!chat){
      banner.hidden=true;
      banner.innerHTML='';
      return;
    }
    banner.hidden=false;
    banner.innerHTML=
      '<span class="currentChatKicker">会話中</span>'+
      '<strong>'+esc(titleOf(chat))+'</strong>'+
      '<small>'+esc(chat.project||'')+' · '+esc(sourceText(chat))+'</small>';
  }

  function decorateRows(){
    qa('#chatList .chat').forEach(function(row){
      var id=row.dataset.id;
      var chat=(state.chats||[]).find(function(item){return item.id===id});
      if(!chat)return;
      normalize(chat);

      var nameLine=row.querySelector('.nameLine');
      if(nameLine&&!nameLine.querySelector('.sourceBadge')){
        var source=document.createElement('span');
        source.className='sourceBadge '+(isChatGpt(chat)?'gpt':'yos');
        source.textContent=sourceText(chat);
        nameLine.appendChild(source);
      }

      row.classList.toggle('currentChat',state[ACTIVE_FIELD]===chat.id);
      if(nameLine){
        var current=nameLine.querySelector('.currentBadge');
        if(state[ACTIVE_FIELD]===chat.id&&!current){
          current=document.createElement('span');
          current.className='currentBadge';
          current.textContent='会話中';
          nameLine.appendChild(current);
        }else if(state[ACTIVE_FIELD]!==chat.id&&current){
          current.remove();
        }
      }

      var preview=row.querySelector('.preview');
      if(preview&&isSharedSnapshot(chat)){
        preview.textContent='共有した時点の内容を開く';
      }else if(preview&&isChatGpt(chat)){
        preview.textContent='ChatGPTの元チャットを開く';
      }

      var meta=row.querySelector('.chatMeta');
      if(meta){
        var stateEl=meta.querySelector('.readState');
        if(!stateEl){
          stateEl=document.createElement('div');
          stateEl.className='readState';
          meta.appendChild(stateEl);
        }
        stateEl.textContent=chat.unread>0?'未読':'既読';
        stateEl.classList.toggle('isUnread',chat.unread>0);
      }
    });
  }

  if(typeof bindChats==='function'){
    var baseBindChats=bindChats;
    bindChats=function(){
      baseBindChats();
      qa('#chatList .chat').forEach(function(row){
        if(row.dataset.unifiedInboxBound==='1')return;
        row.dataset.unifiedInboxBound='1';
        row.addEventListener('click',function(){
          var chat=(state.chats||[]).find(function(item){return item.id===row.dataset.id});
          if(!chat)return;
          markActive(chat.id);
        },true);
      });
    };
  }

  if(typeof renderChats==='function'){
    var baseRenderChats=renderChats;
    renderChats=function(){
      (state.chats||[]).forEach(normalize);
      baseRenderChats();
      var brand=q('#chatsPage .brand strong');
      if(brand)brand.textContent='すべてのチャット';
      var head=q('#chatList')&&q('#chatList').parentElement&&q('#chatList').parentElement.querySelector('.sectionHead span');
      if(head)head.textContent='プロジェクト横断';
      decorateSourceSummary();
      decorateCurrentBanner();
      decorateRows();
      persist();
    };
  }

  var previousVisibility=document.onvisibilitychange;
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden&&typeof renderChats==='function')renderChats();
    if(typeof previousVisibility==='function')previousVisibility();
  });

  document.documentElement.dataset.deskUnifiedInbox='ready';
  if(typeof renderChats==='function')renderChats();
})();