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
    chat.unread=Math.max(0,Number(chat.unread)||0);
    if(!chat.source)chat.source=isChatGpt(chat)?'chatgpt':'yos';
    return chat;
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
  if(state[ACTIVE_FIELD]&&!(state.chats||[]).some(function(chat){return chat.id===state[ACTIVE_FIELD]}))state[ACTIVE_FIELD]='';
  persist();

  function decorateRows(){
    qa('#chatList .chat').forEach(function(row){
      var chat=(state.chats||[]).find(function(item){return item.id===row.dataset.id});
      if(!chat)return;
      normalize(chat);
      row.classList.toggle('currentChat',state[ACTIVE_FIELD]===chat.id);
      row.dataset.source=isChatGpt(chat)?'gpt':'yos';
      row.dataset.sourceLabel=sourceText(chat);

      var preview=row.querySelector('.preview');
      if(preview&&isSharedSnapshot(chat))preview.textContent='共有した時点の内容を開く';
      else if(preview&&isChatGpt(chat))preview.textContent='ChatGPTの元チャットを開く';
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
          if(chat)markActive(chat.id);
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
      if(brand)brand.textContent='チャット';
      decorateRows();
      persist();
    };
  }

  document.addEventListener('visibilitychange',function(){
    if(!document.hidden&&typeof renderChats==='function')renderChats();
  });

  document.documentElement.dataset.deskUnifiedInbox='ready';
  if(typeof renderChats==='function')renderChats();
})();
