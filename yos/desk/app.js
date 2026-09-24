var state = {"version":1,"page":"desk","deskOrder":["clarity","money","clipboard"],"board":[],"metrics":{"opens":0,"taps":0,"reorders":0,"posts":0},"chats":[{"id":"desk-chat","project":"One Enter","title":"YOS DESK UI修正","preview":"DESKとCHATSを分離して1つの入口へ統合","time":"今","unread":2,"pinned":true,"avatar":"Y","tone":"gold","alias":"","url":""},{"id":"clarity-chat","project":"One Enter","title":"Clarity 修理","preview":"実機E2Eまで。Router → 固定子 → Verify","time":"18分","unread":1,"pinned":true,"avatar":"C","tone":"blue","alias":"","url":""},{"id":"money-chat","project":"One Enter","title":"Money 更新","preview":"今使える金・次の支払い・不足見込み","time":"1時間","unread":0,"pinned":false,"avatar":"¥","tone":"green","alias":"","url":""},{"id":"income-chat","project":"収入","title":"収入チャンス監視","preview":"iPhone完結・早い着金を優先","time":"2時間","unread":3,"pinned":true,"avatar":"収","tone":"purple","alias":"","url":""},{"id":"room-chat","project":"生活","title":"部屋レイアウト","preview":"ホテルライクと動線の両立","time":"3時間","unread":0,"pinned":false,"avatar":"家","tone":"coral","alias":"","url":""},{"id":"widget-chat","project":"MY WAY","title":"MY WAY Widget","preview":"予定表示・文字サイズ・余白の調整","time":"4時間","unread":0,"pinned":false,"avatar":"M","tone":"gold","alias":"","url":""},{"id":"night-chat","project":"MY LIFE","title":"Night Check-in 接続","preview":"入力 → AI分析 → MY LIFE保存","time":"昨日","unread":0,"pinned":false,"avatar":"L","tone":"coral","alias":"","url":""},{"id":"brief-chat","project":"MY WAY","title":"Morning Brief 接続","preview":"天気・Calendar・Reminder・Money","time":"昨日","unread":0,"pinned":false,"avatar":"M","tone":"gold","alias":"","url":""}]};

try {
  var savedState = JSON.parse(localStorage.getItem('yosDeskIntegratedStateV1') || 'null');
  if (savedState && typeof savedState === 'object' && Array.isArray(savedState.chats)) state = savedState;
} catch(e) {}

state.metrics = state.metrics || {opens:0,taps:0,reorders:0,posts:0};
state.metrics.opens = (state.metrics.opens || 0) + 1;
function persist(){ try { localStorage.setItem('yosDeskIntegratedStateV1', JSON.stringify(state)); } catch(e) {} }

var currentPage = state.page || "desk";
var chatMode = "all";
var projectFilter = "すべて";
var selecting = false;
var selected = new Set();
var currentChatId = null;
var dragId = null;
var dragTimer = null;
var devCatalog = {
  clarity:{id:"clarity",name:"Clarity",status:"開発中",next:"実機FAIL地点を再確認",pct:68},
  money:{id:"money",name:"Money UI",status:"開発中",next:"MY WAY Money表示を更新",pct:76},
  clipboard:{id:"clipboard",name:"YOS_Clipboard",status:"確認待ち",next:"iPhone実機の入力方式を確認",pct:54}
};
function q(s){return document.querySelector(s)}
function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
function esc(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;")}
function titleOf(x){return x.alias && x.alias.trim() ? x.alias.trim() : x.title}
function tap(){state.metrics.taps = (state.metrics.taps || 0) + 1;persist()}
function showToast(text){var t=q("#toast");t.textContent=text;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},1400)}
function showSheet(html){q("#sheetBody").innerHTML=html;q("#sheetBackdrop").style.display="block"}
function closeSheet(){q("#sheetBackdrop").style.display="none"}
function setPage(name){
  currentPage=name;state.page=name;
  qa(".page").forEach(function(p){p.classList.remove("active")});
  q(name==="desk"?"#deskPage":"#chatsPage").classList.add("active");
  qa(".nav[data-page]").forEach(function(b){b.classList.toggle("active",b.dataset.page===name)});
  if(name==="chats")renderChats();
  persist();
}
function updateClock(){var d=new Date();q("#deskClock").textContent=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")}
function renderDev(){
  var html="";
  state.deskOrder.forEach(function(id,index){var x=devCatalog[id];if(!x)return;html+='<div class="dev" data-dev="'+esc(id)+'"><div class="num">'+String(index+1).padStart(2,"0")+'</div><div class="devText"><div class="devName">'+esc(x.name)+'</div><div class="devNext">次：'+esc(x.next)+'</div></div><div class="devMeta"><div class="devStatus">'+esc(x.status)+'</div><div class="devPct">'+esc(x.pct)+'%</div></div><div class="grip">長押し</div></div>'});
  q("#devList").innerHTML=html;bindDevDrag();persist();
}
function bindDevDrag(){
  qa(".dev").forEach(function(el){
    el.addEventListener("touchstart",function(){var id=el.dataset.dev;dragTimer=setTimeout(function(){dragId=id;el.classList.add("dragging");showToast("上下へ動かして並べ替え")},420)},{passive:true});
    el.addEventListener("touchmove",function(ev){if(!dragId)return;var touch=ev.touches[0];var over=document.elementFromPoint(touch.clientX,touch.clientY);if(!over)return;var target=over.closest(".dev");if(!target)return;var targetId=target.dataset.dev;if(targetId===dragId)return;var from=state.deskOrder.indexOf(dragId),to=state.deskOrder.indexOf(targetId);if(from<0||to<0)return;state.deskOrder.splice(from,1);state.deskOrder.splice(to,0,dragId);state.metrics.reorders=(state.metrics.reorders||0)+1;renderDev();var active=q('[data-dev="'+dragId+'"]');if(active)active.classList.add("dragging");ev.preventDefault()},{passive:false});
    function end(){clearTimeout(dragTimer);dragTimer=null;dragId=null;qa(".dev").forEach(function(x){x.classList.remove("dragging")})}
    el.addEventListener("touchend",end);el.addEventListener("touchcancel",end);el.addEventListener("click",function(){if(dragId)return;tap();openDevDetail(el.dataset.dev)});
  });
}
function openDevDetail(id){var x=devCatalog[id];if(!x)return;showSheet('<h3>'+esc(x.name)+'</h3><p>状態：'+esc(x.status)+'<br>進捗：'+esc(x.pct)+'%<br>次：'+esc(x.next)+'</p><button class="primary" id="goChatsFromDev">関連チャットを見る</button><button id="closeSheetBtn">閉じる</button>');q("#goChatsFromDev").onclick=function(){closeSheet();setPage("chats");q("#searchInput").value=x.name;renderChats()};q("#closeSheetBtn").onclick=closeSheet}
function renderProjects(){var names=["すべて"];state.chats.forEach(function(x){if(names.indexOf(x.project)<0)names.push(x.project)});var html="";names.forEach(function(name){html+='<button class="projectPill '+(name===projectFilter?'active':'')+'" data-project="'+esc(name)+'">'+esc(name)+'</button>'});q("#projects").innerHTML=html;qa(".projectPill").forEach(function(b){b.onclick=function(){tap();projectFilter=b.dataset.project;renderChats()}})}
function filteredChats(){var text=q("#searchInput").value.trim().toLowerCase();return state.chats.filter(function(x){if(projectFilter!=="すべて"&&x.project!==projectFilter)return false;if(chatMode==="unread"&&!x.unread)return false;if(chatMode==="pinned"&&!x.pinned)return false;if(text){var h=(titleOf(x)+" "+x.title+" "+x.project+" "+x.preview).toLowerCase();if(h.indexOf(text)<0)return false}return true}).sort(function(a,b){return Number(b.pinned)-Number(a.pinned)})}
function renderChats(){
  q("#countAll").textContent=" "+state.chats.length;
  q("#countUnread").textContent=" "+state.chats.filter(function(x){return x.unread>0}).length;
  q("#countPinned").textContent=" "+state.chats.filter(function(x){return x.pinned}).length;
  renderProjects();var rows=filteredChats(),html="";
  rows.forEach(function(x){html+='<div class="chat '+(x.pinned?'pinned ':'')+(selected.has(x.id)?'selected':'')+'" data-id="'+esc(x.id)+'"><div class="check">✓</div><div class="avatar '+esc(x.tone||'')+'">'+esc(x.avatar)+'</div><div class="chatText"><div class="nameLine"><div class="chatName">'+esc(titleOf(x))+'</div><span class="tag">'+esc(x.project)+'</span></div><div class="preview">'+esc(x.preview)+'</div></div><div class="chatMeta"><div class="time">'+esc(x.time)+'</div><div class="badge '+(x.unread?'':'hidden')+'">'+(x.unread?esc(x.unread):'')+'</div></div></div>'});
  q("#chatList").innerHTML=html;q("#empty").style.display=rows.length?"none":"block";q("#app").classList.toggle("selecting",selecting);q("#bottom").style.display=selecting?"none":"grid";q("#bulk").style.display=selecting?"grid":"none";q("#selectBtn").textContent=selecting?"完了":"選択";bindChats();persist();
}
function bindChats(){qa(".chat").forEach(function(row){var id=row.dataset.id,timer=null;row.onclick=function(){tap();if(selecting){selected.has(id)?selected.delete(id):selected.add(id);renderChats();return}var x=state.chats.find(function(c){return c.id===id});if(x&&x.unread)x.unread=0;openChatSheet(id);renderChats()};row.addEventListener("touchstart",function(){timer=setTimeout(function(){openChatSheet(id)},500)},{passive:true});row.addEventListener("touchmove",function(){clearTimeout(timer)},{passive:true});row.addEventListener("touchend",function(){clearTimeout(timer)},{passive:true})})}
function openChatSheet(id){
  currentChatId=id;var x=state.chats.find(function(c){return c.id===id});if(!x)return;
  var html='<h3>'+esc(titleOf(x))+'</h3><p>'+esc(x.project)+' · '+esc(x.preview)+'</p><input id="aliasInput" placeholder="固定名" value="'+esc(x.alias||'')+'"><button class="primary" id="saveAlias">固定名を保存</button><button id="toggleUnread">'+(x.unread?'既読にする':'未読にする')+'</button><button id="togglePin">'+(x.pinned?'固定を外す':'固定する')+'</button>';
  if(x.url)html+='<button id="openRealChat">実チャットを開く</button>';
  html+='<button class="danger" id="deleteOne">一覧から削除</button><button id="closeSheetBtn">閉じる</button>';showSheet(html);
  q("#saveAlias").onclick=function(){x.alias=q("#aliasInput").value.trim();closeSheet();renderChats()};q("#toggleUnread").onclick=function(){x.unread=x.unread?0:1;closeSheet();renderChats()};q("#togglePin").onclick=function(){x.pinned=!x.pinned;closeSheet();renderChats()};if(x.url&&q("#openRealChat"))q("#openRealChat").onclick=function(){window.location.href=x.url};q("#deleteOne").onclick=function(){state.chats=state.chats.filter(function(c){return c.id!==id});closeSheet();renderChats()};q("#closeSheetBtn").onclick=closeSheet;
}
function openNew(){showSheet('<h3>NEW</h3><p>新しいチャット入口をYOS DESKへ追加します。実チャットURLは任意です。</p><input id="newTitle" placeholder="チャット名"><input id="newProject" placeholder="プロジェクト名"><input id="newUrl" placeholder="実チャットURL（任意）"><button class="primary" id="createChat">追加</button><button id="closeSheetBtn">閉じる</button>');q("#createChat").onclick=function(){var title=q("#newTitle").value.trim();if(!title){showToast("チャット名を入力");return}var project=q("#newProject").value.trim()||"その他",url=q("#newUrl").value.trim();state.chats.unshift({id:"chat-"+Date.now(),project:project,title:title,preview:"YOS DESKから追加",time:"今",unread:0,pinned:false,avatar:title.charAt(0),tone:"blue",alias:"",url:url});closeSheet();setPage("chats");renderChats();showToast("追加しました")};q("#closeSheetBtn").onclick=closeSheet}
q("#sheetBackdrop").onclick=function(e){if(e.target===q("#sheetBackdrop"))closeSheet()};
qa(".nav[data-page]").forEach(function(b){b.onclick=function(){tap();setPage(b.dataset.page)}});q("#newBtn").onclick=function(){tap();openNew()};
q("#selectBtn").onclick=function(){tap();selecting=!selecting;selected.clear();renderChats()};q("#searchInput").oninput=renderChats;
qa(".tab").forEach(function(b){b.onclick=function(){tap();qa(".tab").forEach(function(x){x.classList.remove("active")});b.classList.add("active");chatMode=b.dataset.mode;renderChats()}});
q("#bulkRead").onclick=function(){state.chats.forEach(function(x){if(selected.has(x.id))x.unread=0});selected.clear();renderChats()};q("#bulkPin").onclick=function(){state.chats.forEach(function(x){if(selected.has(x.id))x.pinned=true});selected.clear();renderChats()};q("#bulkDelete").onclick=function(){if(!selected.size)return;state.chats=state.chats.filter(function(x){return !selected.has(x.id)});selected.clear();renderChats()};
q("#heroBtn").onclick=function(){tap();openDevDetail("clarity")};
qa(".quickBtn").forEach(function(b){b.onclick=function(){tap();var name=b.dataset.quick;if(name==="YOS Chat"){setPage("chats");return}showSheet('<h3>'+esc(name)+'</h3><p>'+esc(name)+' の入口。正式接続まではDESK内の状態確認用です。</p><button class="primary" id="findQuickChat">関連チャットを見る</button><button id="closeSheetBtn">閉じる</button>');q("#findQuickChat").onclick=function(){closeSheet();setPage("chats");q("#searchInput").value=name;renderChats()};q("#closeSheetBtn").onclick=closeSheet}});
q("#nightSuggest").onclick=function(){tap();setPage("chats");q("#searchInput").value="Night Check-in";renderChats()};
q("#mergeSuggest").onclick=function(){tap();showSheet('<h3>統合候補</h3><p>Morning Brief + Money Alert<br>朝の確認を1つにまとめる候補。今は提案表示のみ。</p><button id="closeSheetBtn">閉じる</button>');q("#closeSheetBtn").onclick=closeSheet};
q("#boardBtn").onclick=function(){tap();var html='<h3>共有掲示板</h3>';html+=!state.board.length?'<p>まだ投稿はありません。</p>':'<p>'+state.board.slice().reverse().slice(0,8).map(function(x){return esc(x.time)+' · '+esc(x.text)}).join('<br><br>')+'</p>';html+='<button id="closeSheetBtn">閉じる</button>';showSheet(html);q("#closeSheetBtn").onclick=closeSheet};
q("#metricsBtn").onclick=function(){tap();showSheet('<h3>操作計測</h3><p>起動 '+esc(state.metrics.opens||0)+'回<br>タップ '+esc(state.metrics.taps||0)+'回<br>並べ替え '+esc(state.metrics.reorders||0)+'回<br>投稿 '+esc(state.metrics.posts||0)+'回</p><button id="closeSheetBtn">閉じる</button>');q("#closeSheetBtn").onclick=closeSheet};
q("#deskSend").onclick=function(){tap();var input=q("#deskInput"),text=input.value.trim();if(!text)return;var d=new Date();state.board.push({text:text,time:String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")});state.metrics.posts=(state.metrics.posts||0)+1;input.value="";persist();showToast("共有掲示板へ投稿")};
renderDev();renderChats();setPage(currentPage);updateClock();setInterval(updateClock,30000);window.addEventListener("beforeunload",persist);persist();


/* YOS DESK live sync v1 */
(function(){
  var ASSETS_URL='../../data/yos-assets.json';
  var MISSION_URL='../../data/mission-control.json';
  var MONEY_KEY='yos-money-v2';
  var HOME_SETTINGS_KEY='yos-home-settings-v2';
  var HOME_SETTINGS_LEGACY_KEY='yos-home-settings-v1';
  var TAXI_SETTINGS_KEY='yos-taxi-settings-v2';
  var liveSyncTimer=null;

  function readJSON(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch(e){return fallback}
  }

  function yen(value){
    var n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString('ja-JP')+'円':'未設定';
  }

  function md(date){
    var m=/^\d{4}-(\d{2})-(\d{2})$/.exec(String(date||''));
    return m?(Number(m[1])+'/'+Number(m[2])):'';
  }

  function statusLabel(value){
    return {
      complete:'完了',
      awaiting_device_verification:'実機確認待ち',
      awaiting_production_verification:'本番確認待ち',
      planned:'予定',
      active:'進行中',
      review:'確認中',
      paused:'停止中',
      backlog:'未着手'
    }[String(value||'')]||String(value||'更新中');
  }

  function currentMoney(){
    var money=readJSON(MONEY_KEY,null);
    var facts=money&&money.masterFacts||{};
    var tx=money&&Array.isArray(money.transactions)?money.transactions:[];
    var today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
    var future=tx.filter(function(x){
      return x&&x.date>=today&&!['paid','received','done','completed'].includes(String(x.status||'').toLowerCase());
    }).sort(function(a,b){return String(a.date).localeCompare(String(b.date))});
    var payment=future.find(function(x){return ['expense','debt','saving','investment'].includes(x.type)})||null;
    var income=future.find(function(x){return x.type==='income'})||facts.nextIncome||null;
    return {
      balance:Number.isFinite(Number(facts.currentBalance))?Number(facts.currentBalance):null,
      shortfall:Number.isFinite(Number(facts.shortfallToRequiredPayments))?Number(facts.shortfallToRequiredPayments):null,
      payment:payment,
      income:income,
      updatedAt:money&&money.updatedAt||''
    };
  }

  function paymentText(item){
    if(!item)return '未設定';
    return [md(item.date),item.label,yen(item.amount)].filter(Boolean).join(' ');
  }

  function incomeText(item){
    if(!item)return '未設定';
    var approx=item.amountApproximate||item.certainty==='見込み';
    return [md(item.date),item.label,(approx?'約':'')+yen(item.amount)].filter(Boolean).join(' ');
  }

  function updateMoneyDev(asset){
    var m=currentMoney();
    if(devCatalog.money){
      devCatalog.money.name='Money';
      devCatalog.money.status=asset?statusLabel(asset.status):'自動同期';
      var bits=[];
      if(m.balance!==null)bits.push('使える '+yen(m.balance));
      if(m.payment)bits.push('次 '+paymentText(m.payment));
      devCatalog.money.next=bits.join(' / ')||'実データを確認';
      if(asset&&Number.isFinite(Number(asset.progress)))devCatalog.money.pct=Number(asset.progress);
    }
  }

  function updateClarity(asset){
    if(!asset)return;
    if(devCatalog.clarity){
      devCatalog.clarity.status=statusLabel(asset.status);
      devCatalog.clarity.next=asset.next_action||asset.current||'更新待ち';
      if(Number.isFinite(Number(asset.progress)))devCatalog.clarity.pct=Number(asset.progress);
    }
    var title=q('.heroTitle');
    var eyebrow=q('.eyebrow');
    var sub=q('.heroSub');
    var next=q('.next');
    var big=q('.heroSide .big');
    var label=q('.heroSide .label');
    var bar=q('.heroSide .bar i');
    if(title)title.textContent='Clarity';
    if(eyebrow)eyebrow.textContent='今やる · '+statusLabel(asset.status);
    if(sub)sub.textContent=asset.current||'最新状態を同期中';
    if(next)next.innerHTML='<b>次：</b>'+esc(asset.next_action||'確認待ち');
    if(big)big.textContent=(Number.isFinite(Number(asset.progress))?Number(asset.progress):0)+'%';
    if(label)label.innerHTML='SSOT<br>自動同期';
    if(bar)bar.style.width=Math.max(0,Math.min(100,Number(asset.progress)||0))+'%';
  }

  function storedYosUrl(){
    var a=readJSON(HOME_SETTINGS_KEY,{});
    var b=readJSON(HOME_SETTINGS_LEGACY_KEY,{});
    var c=readJSON(TAXI_SETTINGS_KEY,{});
    var url=String(a.yosUrl||b.yosUrl||c.yosUrl||'').trim();
    return /^https:\/\/chatgpt\.com\//.test(url)?url:'';
  }

  function harvestStoredChatLinks(){
    var found=[];
    for(var i=0;i<localStorage.length;i++){
      var key=localStorage.key(i);
      var raw=localStorage.getItem(key)||'';
      var matches=raw.match(/https:\/\/chatgpt\.com\/(?:c|g)\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g)||[];
      matches.forEach(function(url){
        if(found.indexOf(url)<0)found.push(url);
      });
    }
    var yos=storedYosUrl();
    if(yos&&found.indexOf(yos)<0)found.unshift(yos);
    found.slice(0,20).forEach(function(url,index){
      var existing=state.chats.find(function(x){return x.url===url});
      if(existing)return;
      state.chats.unshift({
        id:'stored-chat-'+Date.now()+'-'+index,
        project:'登録済み',
        title:index===0&&url===yos?'YOS Chat':'ChatGPT',
        preview:'この端末に保存済みのChatGPTリンク',
        time:'登録済み',
        unread:0,
        pinned:index===0,
        avatar:index===0?'Y':'C',
        tone:index===0?'gold':'blue',
        alias:'',
        url:url
      });
    });
    if(found.length)persist();
  }

  function openMoneySheet(){
    var m=currentMoney();
    var html='<h3>Money</h3>'+
      '<p>今使える金：<b>'+esc(m.balance!==null?yen(m.balance):'未設定')+'</b><br>'+
      '次の支払い：'+esc(paymentText(m.payment))+'<br>'+
      '不足見込み：'+esc(m.shortfall!==null?yen(m.shortfall):'未設定')+'<br>'+
      '次の入金：'+esc(incomeText(m.income))+'</p>'+
      '<button class="primary" id="openMoneyPage">MY MONEYを開く</button>'+
      '<button id="closeSheetBtn">閉じる</button>';
    showSheet(html);
    q('#openMoneyPage').onclick=function(){location.href='../#money'};
    q('#closeSheetBtn').onclick=closeSheet;
  }

  function bindRealEntrances(){
    qa('.quickBtn').forEach(function(b){
      var name=b.dataset.quick;
      if(name==='Money')b.onclick=function(){tap();openMoneySheet()};
      else if(name==='Clarity')b.onclick=function(){tap();location.href='shortcuts://run-shortcut?name=Clarity'};
      else if(name==='MY WAY')b.onclick=function(){tap();location.href='../'};
      else if(name==='MY LIFE')b.onclick=function(){tap();location.href='../../life/'};
      else if(name==='YOS Chat')b.onclick=function(){
        tap();
        var url=storedYosUrl();
        if(url){location.href=url;return}
        showSheet('<h3>YOS Chat</h3><p>保存済みのYOSチャットURLがまだありません。</p><button class="primary" id="openChatGPT">ChatGPTを開く</button><button id="closeSheetBtn">閉じる</button>');
        q('#openChatGPT').onclick=function(){location.href='https://chatgpt.com/'};
        q('#closeSheetBtn').onclick=closeSheet;
      };
    });
  }

  async function syncAssets(){
    try{
      var res=await fetch(ASSETS_URL+'?t='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw new Error('asset fetch '+res.status);
      var data=await res.json();
      var assets=Array.isArray(data.assets)?data.assets:[];
      var clarity=assets.find(function(x){return x.id==='clarity'});
      var money=assets.find(function(x){return x.id==='money'});
      updateClarity(clarity);
      updateMoneyDev(money);
      renderDev();
      bindRealEntrances();
      document.documentElement.dataset.liveSync='ok';
    }catch(e){
      updateMoneyDev(null);
      renderDev();
      bindRealEntrances();
      document.documentElement.dataset.liveSync='local-only';
    }
  }

  function updateMissionStats(data){
    var projects=Array.isArray(data&&data.projects)?data.projects:[];
    var inbox=Array.isArray(data&&data.inbox)?data.inbox:[];
    var recent=Array.isArray(data&&data.recently_completed)?data.recently_completed:[];
    var active=projects.filter(function(x){return x&&x.status==='active'}).length;
    var waiting=inbox.filter(function(x){return x&&['review','draft','waiting'].includes(String(x.status||''))}).length;
    var latest=recent[0]||null;
    var cards=qa('.stats .stat');
    if(cards[0]){
      var b0=cards[0].querySelector('b'),s0=cards[0].querySelector('span');
      if(b0)b0.textContent=active+'件';
      if(s0)s0.textContent='稼働中 · 自動同期';
    }
    if(cards[1]){
      var b1=cards[1].querySelector('b'),s1=cards[1].querySelector('span');
      if(b1)b1.textContent=waiting+'件';
      if(s1)s1.textContent='確認待ち';
    }
    if(cards[2]&&latest){
      var b2=cards[2].querySelector('b'),s2=cards[2].querySelector('span');
      if(b2)b2.textContent=String(latest.title||'最近完了').replace(/^PR #\d+\s*/,'').slice(0,18);
      if(s2)s2.textContent='最近完了 · '+String(data.updated_at||'').slice(11,16);
    }
  }

  async function syncMission(){
    try{
      var res=await fetch(MISSION_URL+'?t='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw new Error('mission fetch '+res.status);
      updateMissionStats(await res.json());
      document.documentElement.dataset.missionSync='ok';
    }catch(e){
      document.documentElement.dataset.missionSync='unavailable';
    }
  }

  function syncLocal(){
    updateMoneyDev(null);
    harvestStoredChatLinks();
    renderDev();
    renderChats();
    bindRealEntrances();
  }

  function runLiveSync(){
    syncLocal();
    syncAssets();
    syncMission();
  }

  harvestStoredChatLinks();
  bindRealEntrances();
  runLiveSync();
  clearInterval(liveSyncTimer);
  liveSyncTimer=setInterval(runLiveSync,30000);
  window.addEventListener('storage',runLiveSync);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)runLiveSync()});
})();
