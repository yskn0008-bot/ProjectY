'use strict';

var STORAGE_KEY='yosDeskIntegratedStateV1';
var state={version:2,page:'chats',metrics:{opens:0,taps:0},chats:[],chatThreads:{},assetThreadVersions:{}};

try{
  var savedState=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
  if(savedState&&typeof savedState==='object'&&Array.isArray(savedState.chats))state=savedState;
}catch(e){}

state.chats=Array.isArray(state.chats)?state.chats:[];
state.chatThreads=state.chatThreads&&typeof state.chatThreads==='object'?state.chatThreads:{};
state.assetThreadVersions=state.assetThreadVersions&&typeof state.assetThreadVersions==='object'?state.assetThreadVersions:{};
state.metrics=state.metrics&&typeof state.metrics==='object'?state.metrics:{opens:0,taps:0};
state.page='chats';
state.metrics.opens=(Number(state.metrics.opens)||0)+1;

function persist(){
  try{
    var snapshot=JSON.parse(JSON.stringify(state));
    var temporaryIds=(snapshot.chats||[]).filter(function(x){return x&&x.temporary}).map(function(x){return x.id});
    snapshot.chats=(snapshot.chats||[]).filter(function(x){return !x.temporary});
    if(snapshot.chatThreads&&typeof snapshot.chatThreads==='object'){
      temporaryIds.forEach(function(id){delete snapshot.chatThreads[id]});
    }
    if(temporaryIds.indexOf(snapshot.activeChatId)>=0)snapshot.activeChatId='';
    snapshot.page='chats';
    localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
  }catch(e){}
}

var currentPage='chats';
var chatMode='all';
var projectFilter='すべて';
var selecting=false;
var selected=new Set();
var currentChatId=null;

function q(s){return document.querySelector(s)}
function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function titleOf(x){return x&&x.alias&&x.alias.trim()?x.alias.trim():String(x&&x.title||'チャット')}
function tap(){state.metrics.taps=(Number(state.metrics.taps)||0)+1;persist()}
function showToast(text){
  var t=q('#toast');
  if(!t)return;
  t.textContent=text;
  t.classList.add('show');
  setTimeout(function(){t.classList.remove('show')},1400);
}
function showSheet(html){
  var body=q('#sheetBody'),backdrop=q('#sheetBackdrop');
  if(!body||!backdrop)return;
  body.innerHTML=html;
  backdrop.style.display='block';
}
function closeSheet(){
  var backdrop=q('#sheetBackdrop');
  if(backdrop)backdrop.style.display='none';
}
function setPage(name){
  if(name==='thread')return;
  currentPage='chats';
  state.page='chats';
  qa('.page').forEach(function(p){p.classList.remove('active')});
  var chats=q('#chatsPage');
  if(chats)chats.classList.add('active');
  renderChats();
  persist();
}
function renderProjects(){
  projectFilter='すべて';
  var holder=q('#projects');
  if(holder){holder.innerHTML='';holder.style.display='none'}
}
function filteredChats(){
  var input=q('#searchInput');
  var text=String(input&&input.value||'').trim().toLowerCase();
  return state.chats.filter(function(x){
    if(!x||x.temporary)return false;
    if(chatMode==='unread'&&!Number(x.unread))return false;
    if(chatMode==='pinned'&&!x.pinned)return false;
    if(text){
      var hay=[titleOf(x),x.title,x.project,x.preview].join(' ').toLowerCase();
      if(hay.indexOf(text)<0)return false;
    }
    return true;
  }).sort(function(a,b){
    var pin=Number(Boolean(b.pinned))-Number(Boolean(a.pinned));
    if(pin)return pin;
    return String(b.lastOpenedAt||b.updatedAt||'').localeCompare(String(a.lastOpenedAt||a.updatedAt||''));
  });
}
function renderChats(){
  var listed=state.chats.filter(function(x){return x&&!x.temporary});
  var all=q('#countAll'),unread=q('#countUnread'),pinned=q('#countPinned');
  if(all)all.textContent=' '+listed.length;
  if(unread)unread.textContent=' '+listed.filter(function(x){return Number(x.unread)>0}).length;
  if(pinned)pinned.textContent=' '+listed.filter(function(x){return x.pinned}).length;
  renderProjects();

  var rows=filteredChats(),html='';
  rows.forEach(function(x){
    html+='<div class="chat '+(x.pinned?'pinned ':'')+(selected.has(x.id)?'selected ':'')+'" data-id="'+esc(x.id)+'">'+
      '<div class="check">✓</div>'+
      '<div class="avatar '+esc(x.tone||'')+'">'+esc(x.avatar||'Y')+'</div>'+
      '<div class="chatText"><div class="nameLine"><div class="chatName">'+esc(titleOf(x))+'</div><span class="tag">'+esc(x.project||'')+'</span></div>'+
      '<div class="preview">'+esc(x.preview||'')+'</div></div>'+
      '<div class="chatMeta"><div class="time">'+esc(x.time||'')+'</div><div class="badge '+(Number(x.unread)>0?'':'hidden')+'">'+(Number(x.unread)>0?esc(x.unread):'')+'</div></div>'+
      '</div>';
  });

  var list=q('#chatList'),empty=q('#empty'),bulk=q('#bulk');
  if(list)list.innerHTML=html;
  if(empty)empty.style.display=rows.length?'none':'flex';
  q('#app')&&q('#app').classList.toggle('selecting',selecting);
  if(bulk)bulk.style.display=selecting?'grid':'none';
  var select=q('#selectBtn');
  if(select)select.textContent=selecting?'完了':'編集';
  var emptyAdd=q('#emptyAdd');
  if(emptyAdd)emptyAdd.onclick=function(){tap();openNew()};
  bindChats();
  persist();
}
function bindChats(){
  qa('.chat').forEach(function(row){
    var id=row.dataset.id,timer=null,longPressed=false;
    row.onclick=function(){
      tap();
      if(longPressed){longPressed=false;return}
      if(selecting){
        selected.has(id)?selected.delete(id):selected.add(id);
        renderChats();
        return;
      }
      var chat=state.chats.find(function(x){return x.id===id});
      if(!chat)return;
      if(Number(chat.unread))chat.unread=0;
      chat.lastOpenedAt=new Date().toISOString();
      persist();
      if(chat.url){location.href=chat.url;return}
      openChatSheet(id);
      renderChats();
    };
    row.addEventListener('touchstart',function(){
      longPressed=false;
      timer=setTimeout(function(){longPressed=true;openChatSheet(id)},500);
    },{passive:true});
    row.addEventListener('touchmove',function(){clearTimeout(timer)},{passive:true});
    row.addEventListener('touchend',function(){clearTimeout(timer)},{passive:true});
  });
}
function openChatSheet(id){
  currentChatId=id;
  var x=state.chats.find(function(c){return c.id===id});
  if(!x)return;
  var html='<h3>'+esc(titleOf(x))+'</h3><p>'+esc(x.project||'')+' · '+esc(x.preview||'')+'</p>'+
    '<input id="aliasInput" placeholder="名前" value="'+esc(x.alias||'')+'">'+
    '<button class="primary" id="saveAlias">名前を保存</button>'+
    '<button id="toggleUnread">'+(Number(x.unread)>0?'既読にする':'未読にする')+'</button>'+
    '<button id="togglePin">'+(x.pinned?'固定を外す':'固定する')+'</button>';
  if(x.url)html+='<button id="openRealChat">GPT原文を開く</button>';
  html+='<button class="danger" id="deleteOne">一覧から削除</button><button id="closeSheetBtn">閉じる</button>';
  showSheet(html);
  q('#saveAlias').onclick=function(){x.alias=q('#aliasInput').value.trim();closeSheet();renderChats()};
  q('#toggleUnread').onclick=function(){x.unread=Number(x.unread)>0?0:1;closeSheet();renderChats()};
  q('#togglePin').onclick=function(){x.pinned=!x.pinned;closeSheet();renderChats()};
  if(x.url&&q('#openRealChat'))q('#openRealChat').onclick=function(){location.href=x.url};
  q('#deleteOne').onclick=function(){
    state.chats=state.chats.filter(function(c){return c.id!==id});
    if(state.chatThreads)delete state.chatThreads[id];
    if(state.activeChatId===id)state.activeChatId='';
    closeSheet();
    renderChats();
  };
  q('#closeSheetBtn').onclick=closeSheet;
}

function canonicalChatUrl(value){
  var text=String(value||'');
  var match=text.match(/https:\/\/chatgpt\.com\/(?:g\/[^\s/?#]+\/c\/|c\/)[A-Za-z0-9-]+/i);
  return match?match[0].replace(/[),.;!?]+$/,''):'';
}
function addChatEntry(url,title,project,options){
  options=options||{};
  url=canonicalChatUrl(url);
  if(!url){if(!options.silent)showToast('ChatGPTの元チャットURLが必要です');return false}
  var exists=state.chats.find(function(x){return x&&canonicalChatUrl(x.url)===url});
  if(exists){
    exists.source='chatgpt';
    exists.unread=0;
    exists.lastOpenedAt=new Date().toISOString();
    if(title&&title!=='ChatGPT原文')exists.title=String(title).trim().slice(0,80)||exists.title;
    if(project)exists.project=String(project).trim().slice(0,80)||exists.project;
    state.activeChatId=exists.id;
    persist();
    renderChats();
    if(!options.silent)showToast('GPT原文は同期済みです');
    return true;
  }
  title=String(title||'ChatGPT原文').trim().slice(0,80)||'ChatGPT原文';
  project=String(project||'ChatGPT').trim().slice(0,80)||'ChatGPT';
  var chat={
    id:'gpt-original-'+Date.now()+'-'+Math.random().toString(16).slice(2),
    project:project,title:title,preview:'ChatGPTの元チャットを開く',time:'',unread:0,pinned:false,
    avatar:'G',tone:'blue',alias:'',url:url,source:'chatgpt',lastOpenedAt:new Date().toISOString()
  };
  state.chats.unshift(chat);
  state.activeChatId=chat.id;
  persist();
  renderChats();
  if(!options.silent)showToast('GPT原文を追加しました');
  return true;
}
globalThis.yosDeskReceiveOriginal=function(value,meta){
  meta=meta||{};
  return addChatEntry(value,meta.title||'ChatGPT原文',meta.project||'ChatGPT',{silent:Boolean(meta.silent)});
};

function environmentCandidates(){
  var out=[];
  function collect(params){
    ['url','chat','gpt','source','text'].forEach(function(key){
      var value=params.get(key);
      if(value)out.push({value:value,title:params.get('title')||'',project:params.get('project')||''});
    });
  }
  try{collect(new URLSearchParams(location.search||''))}catch(e){}
  try{collect(new URLSearchParams(String(location.hash||'').replace(/^#/,'')))}catch(e){}
  if(document.referrer)out.push({value:document.referrer,title:'',project:''});

  [localStorage,sessionStorage].forEach(function(store){
    try{
      for(var i=0;i<store.length;i++){
        var key=store.key(i);
        if(!key||key===STORAGE_KEY)continue;
        var value=store.getItem(key);
        if(value&&value.indexOf('chatgpt.com/')>=0)out.push({value:value,title:'',project:''});
      }
    }catch(e){}
  });
  return out;
}
function autoImportOriginals(){
  var imported=false;
  environmentCandidates().forEach(function(item){
    var url=canonicalChatUrl(item.value);
    if(!url)return;
    if(addChatEntry(url,item.title||'ChatGPT原文',item.project||'ChatGPT',{silent:true}))imported=true;
  });
  if(imported&&(/(?:\?|#).*(?:url|chat|gpt|source|text)=/i.test(location.href))){
    try{history.replaceState(null,'',location.pathname)}catch(e){}
  }
}
async function autoReadGrantedClipboard(){
  if(!navigator.clipboard||!navigator.clipboard.readText||!navigator.permissions||!navigator.permissions.query)return;
  try{
    var permission=await navigator.permissions.query({name:'clipboard-read'});
    if(permission.state!=='granted')return;
    var text=await navigator.clipboard.readText();
    var url=canonicalChatUrl(text);
    if(url)addChatEntry(url,'ChatGPT原文','ChatGPT',{silent:true});
  }catch(e){}
}

async function addClipboardChat(){
  try{
    var text=await navigator.clipboard.readText();
    if(addChatEntry(text,'ChatGPT原文','ChatGPT'))return;
  }catch(e){}
  openGptEntry();
}
function openGptEntry(){
  showSheet('<h3>GPT原文</h3><p>通常は自動取得します。自動取得できない時だけURLを貼ってください。</p>'+
    '<button class="primary" id="pasteChatUrl">コピーしたURLを読む</button>'+
    '<input id="newUrl" placeholder="https://chatgpt.com/...">'+
    '<button id="createChat">URLを追加</button><button id="backToNew">戻る</button>');
  q('#pasteChatUrl').onclick=addClipboardChat;
  q('#createChat').onclick=function(){addChatEntry(q('#newUrl').value,'ChatGPT原文','ChatGPT')};
  q('#backToNew').onclick=openNew;
}
function createYosChat(temporary){
  var create=globalThis.yosDeskCreateChat;
  if(typeof create!=='function'){showToast('チャットを準備しています');return}
  closeSheet();
  create({temporary:Boolean(temporary)});
}
function openNew(){
  showSheet('<h3>新規チャット</h3>'+
    '<button class="primary" id="createYosChat">新規チャット</button>'+
    '<button id="createTemporaryChat">一時チャット <small>履歴に残さない</small></button>'+
    '<button id="addGptOriginal">GPT原文</button>'+
    '<button id="closeSheetBtn">閉じる</button>');
  q('#createYosChat').onclick=function(){createYosChat(false)};
  q('#createTemporaryChat').onclick=function(){createYosChat(true)};
  q('#addGptOriginal').onclick=openGptEntry;
  q('#closeSheetBtn').onclick=closeSheet;
}

var backdrop=q('#sheetBackdrop');
if(backdrop)backdrop.onclick=function(e){if(e.target===backdrop)closeSheet()};
var newBtn=q('#newBtn');
if(newBtn)newBtn.onclick=function(){tap();openNew()};
var selectBtn=q('#selectBtn');
if(selectBtn)selectBtn.onclick=function(){tap();selecting=!selecting;selected.clear();renderChats()};
var searchInput=q('#searchInput');
if(searchInput)searchInput.oninput=renderChats;
qa('.tab').forEach(function(b){
  b.onclick=function(){
    tap();
    qa('.tab').forEach(function(x){x.classList.remove('active')});
    b.classList.add('active');
    chatMode=b.dataset.mode;
    renderChats();
  };
});
var bulkRead=q('#bulkRead');
if(bulkRead)bulkRead.onclick=function(){state.chats.forEach(function(x){if(selected.has(x.id))x.unread=0});selected.clear();renderChats()};
var bulkPin=q('#bulkPin');
if(bulkPin)bulkPin.onclick=function(){state.chats.forEach(function(x){if(selected.has(x.id))x.pinned=true});selected.clear();renderChats()};
var bulkDelete=q('#bulkDelete');
if(bulkDelete)bulkDelete.onclick=function(){
  if(!selected.size)return;
  state.chats=state.chats.filter(function(x){return !selected.has(x.id)});
  selected.forEach(function(id){if(state.chatThreads)delete state.chatThreads[id]});
  selected.clear();
  renderChats();
};

autoImportOriginals();
autoReadGrantedClipboard();
renderChats();
setPage('chats');
document.documentElement.dataset.deskChatOnly='ready';
document.documentElement.dataset.deskAutoOriginal='ready';
window.addEventListener('focus',function(){autoImportOriginals();autoReadGrantedClipboard()});
document.addEventListener('visibilitychange',function(){if(!document.hidden){autoImportOriginals();autoReadGrantedClipboard()}});
window.addEventListener('beforeunload',persist);
persist();
