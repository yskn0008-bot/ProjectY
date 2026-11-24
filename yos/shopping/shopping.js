'use strict';
(()=>{
  // The Scriptable host injects a Notion snapshot. There is no remote application API.
  const NATIVE=globalThis.YOS_SHOPPING_NATIVE||null;
  const FAVORITES_KEY='yos-shopping-favorites-v1';
  const VIEW_KEY='yos-shopping-view-v1';
  const el=id=>document.getElementById(id);
  const state={items:[],demo:true,filter:'all',sort:'recommended',search:'',favorites:new Set(),view:'grid',busy:false};
  const imgIcons={'食品':'🥛','美容':'✧','衛生':'◈','洗濯':'◇','掃除':'▣','家具':'▤','家電':'▣','その他':'◈'};
  const demoList=[
    ['d1','キュレル 保湿ジェル 120g','美容',1408,1760,'楽天','https://www.rakuten.co.jp/'],
    ['d2','ザバス ホエイプロテイン 1kg','食品',3980,4980,'Amazon','https://www.amazon.co.jp/'],
    ['d3','アキュビュー オアシス 30枚','衛生',2680,3280,'Yahoo!','https://shopping.yahoo.co.jp/'],
    ['d4','アタックZERO 詰め替え 1140g','洗濯',1078,1188,'Amazon','https://www.amazon.co.jp/'],
    ['d5','ニベアクリーム 大缶 169g','美容',547,657,'楽天','https://www.rakuten.co.jp/'],
    ['d6','オイコス 無糖 12個','食品',1480,1728,'Amazon','https://www.amazon.co.jp/'],
    ['d7','パンテーン シャンプー 400ml','美容',698,798,'ドラッグストア',''],
    ['d8','バナナ 1房','食品',158,198,'近隣スーパー',''],
    ['d9','スコッティ ティッシュ 5箱','衛生',398,448,'Amazon','https://www.amazon.co.jp/'],
    ['d10','ネスカフェ ゴールドブレンド 80g','食品',698,798,'楽天','https://www.rakuten.co.jp/']
  ];
  const nowDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const demoItems=()=>demoList.map(([id,name,category,currentPrice,referencePrice,store,url],index)=>({
    id,name,category,type:index===3||index===8?'日用品':'欲しいもの',state:index===3||index===8?'検討中':'購入候補',priority:'中',
    purchased:false,currentPrice,referencePrice,targetPrice:currentPrice,priceSource:'手動',priceUpdatedAt:nowDay(),
    shop:[store],url:url||null,imageUrl:null,stock:index===3||index===8?0:null,reorderAt:index===3||index===8?1:null,
    updatedAt:new Date().toISOString(),demoSale:true
  }));
  function safeRead(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
  function store(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  const savedFavorites=safeRead(FAVORITES_KEY,[]);
  if(Array.isArray(savedFavorites))state.favorites=new Set(savedFavorites.filter(s=>typeof s==='string'&&s.length<60));
  state.view=safeRead(VIEW_KEY,'grid')==='list'?'list':'grid';
  const escapeText=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeLink=value=>{
    if(typeof value!=='string')return'';
    try{const u=new URL(value);return u.protocol==='https:'?u.href:''}catch{return''}
  };
  const yen=v=>typeof v==='number'&&Number.isFinite(v)?'¥'+Math.round(v).toLocaleString('ja-JP'):'未確認';
  // A shop's public Product JSON-LD quote is not a confirmed checkout price.
  // Keep it separate from Notion currentPrice so sale/buy counters cannot
  // falsely treat the quote as a purchase-ready discount.
  const publicListing=item=>Number.isFinite(item.webPrice)&&item.webPrice>=1&&
    Boolean(safeLink(item.webPriceSourceUrl))&&
    typeof item.webPriceCheckedAt==='string'&&Number.isFinite(Date.parse(item.webPriceCheckedAt));
  function priceEvidence(item){
    const recorded=Number.isFinite(item.currentPrice);
    const listed=publicListing(item);
    if(listed&&item.webPriceFresh)return {label:'Web掲載',amount:item.webPrice,
      subtitle:'掲載確認 '+item.webPriceCheckedAt.slice(0,10)+'｜送料・在庫未確認',kind:'web'};
    if(recorded&&recentPrice(item))return {label:'登録',amount:item.currentPrice,
      subtitle:(item.priceUpdatedAt||'')+' 記録｜送料未確認',kind:'registered'};
    if(listed)return {label:'前回掲載',amount:item.webPrice,
      subtitle:item.webPriceCheckedAt.slice(0,10)+' 時点｜現在は未確認',kind:'stale'};
    if(recorded)return {label:'過去の登録',amount:item.currentPrice,
      subtitle:(item.priceUpdatedAt||'更新日不明')+' の記録',kind:'stale'};
    if(Number.isFinite(item.referencePrice))return {label:'参考',amount:item.referencePrice,
      subtitle:'Notion登録値｜現在の販売価格ではありません',kind:'reference'};
    return {label:'',amount:null,subtitle:item.url?'販売ページは登録済み｜価格未取得':'商品URL・価格が未登録',kind:'missing'};
  }
  function qualitySummary(items){
    const linked=items.filter(x=>Boolean(safeLink(x.url))).length;
    const listed=items.filter(x=>publicListing(x)&&x.webPriceFresh).length;
    const recorded=items.filter(x=>Number.isFinite(x.currentPrice)&&recentPrice(x)).length;
    const references=items.filter(x=>Number.isFinite(x.referencePrice)).length;
    const undetermined=items.filter(x=>/確認待ち|銘柄選定待ち|テスト商品/.test(x.name)).length;
    return {linked,listed,recorded,references,undetermined};
  }
  const diffPct=item=>{
    const a=item.currentPrice,b=item.referencePrice;
    return Number.isFinite(a)&&Number.isFinite(b)&&b>0&&a>=0&&a<b?Math.max(1,Math.round((b-a)/b*100)):null;
  };
  const recentPrice=item=>{
    if(!item.priceUpdatedAt)return false;
    const t=Date.parse(item.priceUpdatedAt.length===10?item.priceUpdatedAt+'T00:00:00+09:00':item.priceUpdatedAt);
    const age=Date.now()-t;
    return Number.isFinite(t)&&age>=-3600000&&age<3*86400000;
  };
  const sale=item=>!item.purchased&&Boolean(diffPct(item))&&(
    state.demo&&item.demoSale===true ||
    recentPrice(item)&&Boolean(item.url)&&item.shop.length>0&&Boolean(item.priceSource)
  );
  const restock=item=>!item.purchased&&item.type==='日用品'&&
    Number.isFinite(item.stock)&&Number.isFinite(item.reorderAt)&&item.stock<=item.reorderAt;
  const buy=item=>!item.purchased&&item.state!=='保留'&&
    Number.isFinite(item.targetPrice)&&Number.isFinite(item.currentPrice)&&
    item.currentPrice<=item.targetPrice&&recentPrice(item);
  const selected=item=>!item.purchased&&item.state==='購入候補';
  const recommend=item=>!item.purchased&&(sale(item)||buy(item)||restock(item)||selected(item));
  const sortRank=item=> (restock(item)?100:0)+(sale(item)?60:0)+(buy(item)?30:0)+(selected(item)?18:0)+(item.priority==='高'?10:0);
  const number=(id,count)=>{const node=el(id);if(node)node.textContent=String(count)};
  function status(message){el('connectionState').textContent=message}
  let toastTimeout;
  function toast(message){
    const node=el('toast');node.textContent=message;node.hidden=false;
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{node.hidden=true},3600);
  }
  function setData(items,asDemo){
    state.items=Array.isArray(items)?items:[];
    state.demo=asDemo;
    status(asDemo?'サンプル画面｜実データの販売価格・在庫ではありません':
      '既存Notionの商品情報を読込済み｜掲載価格は商品ページの公開記載（送料・在庫は別確認）');
    render();
  }
  function count(pred){return state.items.filter(x=>!x.purchased&&pred(x)).length}
  function activeList(){
    const q=state.search.toLocaleLowerCase('ja-JP');
    let items=state.items.filter(item=>{
      if(q&&![item.name,item.category,item.type,...item.shop].join(' ').toLocaleLowerCase('ja-JP').includes(q))return false;
      switch(state.filter){
        case 'sale':return sale(item);
        case 'buy':return buy(item);
        case 'stock':return restock(item);
        case 'selected':return selected(item);
        case 'daily':return !item.purchased&&item.type==='日用品';
        case 'beauty':return !item.purchased&&['美容','衛生'].includes(item.category);
        case 'food':return !item.purchased&&item.category==='食品';
        case 'favorites':return !item.purchased&&state.favorites.has(item.id);
        case 'purchased':return item.purchased;
        case 'recommended':return recommend(item);
        default:return !item.purchased;
      }
    });
    items.sort((a,b)=>{
      if(state.sort==='discount')return (diffPct(b)||0)-(diffPct(a)||0)||a.name.localeCompare(b.name,'ja');
      if(state.sort==='price')return (a.currentPrice??Infinity)-(b.currentPrice??Infinity);
      if(state.sort==='name')return a.name.localeCompare(b.name,'ja');
      if(state.sort==='latest')return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
      return sortRank(b)-sortRank(a)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
    });
    return items;
  }
  function effectivePhoto(item){
    const local=typeof item.localPhotoData==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]{16,750000}$/.test(item.localPhotoData)?item.localPhotoData:'';
    return local||safeLink(item.imageUrl);
  }
  function imageBlock(item){
    const image=effectivePhoto(item);
    const kind=item.photoKind==='representative'?'representative':'product';
    if(image)return '<img loading="lazy" decoding="async" alt="'+escapeText(kind==='representative'?'カテゴリ参考写真':'商品写真：'+item.name)+'" src="'+escapeText(image)+'">'+
      (kind==='representative'?'<span class="reference-photo-label">参考写真</span>':'');
    return '<div class="no-photo" aria-label="商品写真未取得"><span class="missing-glyph">'+escapeText(imgIcons[item.category]||'◈')+'</span><small>'+escapeText(item.photoStatus||'写真未取得')+'</small></div>';
  }
  function badge(item){
    if(restock(item))return '<span class="flag restock">▣ 補充候補</span>';
    if(sale(item))return '<span class="flag" title="Notion登録参考価格との差。最新販売条件は要確認">◆ 値引き候補</span>';
    if(selected(item))return '<span class="flag selected">★ 購入候補</span>';
    return '';
  }
  function card(item){
    const favorite=state.favorites.has(item.id);
    const pct=diffPct(item);
    const url=safeLink(item.url);
    const evidence=priceEvidence(item);
    const priceText=evidence.amount===null?'価格未取得':evidence.label+' '+yen(evidence.amount);
    const statusText=item.purchased?'購入済':restock(item)?'補充が必要':buy(item)?'目標価格以下':selected(item)?'購入候補':item.state==='保留'?'保留中':'検討中';
    const statusClass=item.purchased?'purchase-status purchased-state':restock(item)?'purchase-status stock':buy(item)?'purchase-status':selected(item)?'purchase-status selected-state':'purchase-status wait';
    const photoMissing=!effectivePhoto(item);
    const actions='<button type="button" data-action="detail" data-id="'+escapeText(item.id)+'" aria-label="商品詳細">詳細</button>'+
      (NATIVE?'<button type="button" data-action="edit" data-id="'+escapeText(item.id)+'" aria-label="価格と在庫を編集">編集</button>':'')+
      (url?'<a href="'+escapeText(url)+'" target="_blank" rel="noopener noreferrer" aria-label="商品ページを開く">↗</a>':'');
    return '<article class="product-card'+(item.purchased?' purchased':'')+'" data-id="'+escapeText(item.id)+'">'+
      badge(item)+
      '<div class="product-photo">'+imageBlock(item)+
      (photoMissing&&NATIVE?'<button class="photo-quick" type="button" data-action="photo" data-id="'+escapeText(item.id)+'" aria-label="商品写真を追加">＋</button>':'')+
      '</div>'+
      '<div class="product-details">'+
      '<div class="product-heading-row"><h3 class="product-heading" title="'+escapeText(item.name)+'">'+escapeText(item.name)+'</h3>'+
      '<button class="heart'+(favorite?' active':'')+'" type="button" data-action="favorite" data-id="'+escapeText(item.id)+'" aria-label="'+(favorite?'お気に入りから外す':'お気に入りに追加')+'">'+(favorite?'♥':'♡')+'</button></div>'+
      '<span class="category-tag">'+escapeText(item.category||item.type||'その他')+'</span>'+
      '<span class="'+statusClass+'">'+escapeText(statusText)+'</span>'+
      '<div class="price-row"><strong class="price-now'+(evidence.kind==='missing'||evidence.kind==='reference'||evidence.kind==='stale'?' unknown':'')+'">'+escapeText(priceText)+'</strong>'+
      (pct&&sale(item)?'<del class="price-was">'+yen(item.referencePrice)+'</del><span class="discount-rate">'+pct+'% 登録価格差</span>':'')+'</div>'+
      '<small class="price-evidence '+escapeText(evidence.kind)+'">'+escapeText(evidence.subtitle)+'</small>'+
      (evidence.kind==='web'||evidence.kind==='stale'&&publicListing(item)?'<a class="price-source" href="'+escapeText(safeLink(item.webPriceSourceUrl))+'" target="_blank" rel="noopener noreferrer">掲載元を確認</a>':'')+
      '<span class="store-label" title="'+escapeText(item.shop.join('・'))+'">'+(item.shop.length?'登録店: '+escapeText(item.shop.join('・')):'販売店未登録')+'</span>'+
      '<div class="product-actions">'+actions+'</div></div></article>';
  }
  function render(){
    const q=qualitySummary(state.items);
    const health=el('dataHealth');
    if(health)health.innerHTML=state.demo?
      '<strong>サンプル表示</strong><span>ここに表示する商品・価格は実際の登録情報ではありません</span>':
      '<strong>実データ '+state.items.length+'件</strong>'+
      '<span>商品URL '+q.linked+'件｜24時間内のWeb掲載 '+q.listed+'件｜3日内の登録価格 '+q.recorded+'件</span>'+
      '<small>参考価格 '+q.references+'件は現在の販売価格ではありません。商品特定待ち '+q.undetermined+'件。</small>';
    const all=state.items.filter(x=>!x.purchased).length;
    number('allCount',all);number('saleCount',count(sale));number('chipSaleCount',count(sale));
    number('buyCount',count(buy));number('chipBuyCount',count(buy));
    number('stockCount',count(restock));number('chipStockCount',count(restock));number('recCount',count(recommend)+'件');
    const selectedCount=count(selected);number('chipSelectedCount',selectedCount);
    const reason=el('recommendReason');
    if(reason)reason.textContent=selectedCount?`Notionで選択済み${selectedCount}件を含む｜実売価格は未確認`:
      count(recommend)?'登録価格差や補充の記録を確認':'登録済みの候補・補充・価格差なし';
    document.querySelectorAll('[data-filter]').forEach(node=>{
      const selected=node.dataset.filter===state.filter;
      if(node.classList.contains('chip'))node.classList.toggle('selected',selected);
      node.setAttribute('aria-pressed',String(selected));
    });
    const grid=el('productGrid');grid.classList.toggle('list-mode',state.view==='list');
    el('listMode').classList.toggle('active',state.view==='list');
    el('gridMode').classList.toggle('active',state.view==='grid');
    el('listMode').setAttribute('aria-pressed',String(state.view==='list'));
    el('gridMode').setAttribute('aria-pressed',String(state.view==='grid'));
    const items=activeList();
    grid.innerHTML=items.length?items.map(card).join(''):'<div class="empty-state"><span style="font-size:30px">◇</span><b>該当する商品はありません</b><span>検索や絞り込みを変更してください。</span><button type="button" data-action="clear">すべて表示</button></div>';
    grid.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.replaceWith(Object.assign(document.createElement('div'),{className:'no-photo',textContent:'写真を表示できません'}))},{once:true}));
    document.querySelectorAll('[data-bottom]').forEach(node=>node.classList.toggle('current',
      node.dataset.bottom===state.filter||(node.dataset.bottom==='all'&&state.filter==='recommended')));
  }
  function filter(value){
    state.filter=value;render();window.scrollTo({top:0,behavior:'smooth'});
  }
  function detail(item){
    const url=safeLink(item.url),pct=diffPct(item),photo=effectivePhoto(item);
    const message=state.demo?'サンプル表示：実際の価格ではありません':pct?
      '登録参考価格との差。送料・クーポン・販売期間・沖縄への配送を購入前に確認してください。':
      '値引き情報は未確認です。';
    el('detailContent').innerHTML=
      '<h2>'+escapeText(item.name)+'</h2>'+
      '<div class="detail-summary"><div>'+(photo?'<img src="'+escapeText(photo)+'" alt="商品写真">':
      '<div class="no-photo">写真未登録</div>')+'</div><dl class="detail-meta">'+
      '<div><dt>現在の登録価格</dt><dd>'+yen(item.currentPrice)+'</dd></div>'+
      '<div><dt>参考価格</dt><dd>'+yen(item.referencePrice)+'</dd></div>'+
      '<div><dt>目標価格</dt><dd>'+yen(item.targetPrice)+'</dd></div>'+
      '<div><dt>販売店</dt><dd>'+escapeText(item.shop.join('・')||'未登録')+'</dd></div>'+
      '<div><dt>価格確認日 / 情報元</dt><dd>'+escapeText(item.priceUpdatedAt||'未確認')+' / '+escapeText(item.priceSource||'未確認')+'</dd></div>'+
      '<div><dt>商品ページからの掲載価格（未確約）</dt><dd>'+(publicListing(item)?yen(item.webPrice)+'｜'+escapeText(item.webPriceCheckedAt.slice(0,10)):'未取得')+'</dd></div>'+
      '</dl></div>'+
      (publicListing(item)?'<p class="source-notice">掲載価格は商品ページの構造化情報で、購入可能な税込総額ではありません。沖縄への送料・在庫・クーポンは購入前に確認。<a target="_blank" rel="noopener noreferrer" href="'+escapeText(safeLink(item.webPriceSourceUrl))+'">確認した商品ページ</a></p>':'<p class="source-notice">商品ページから確認できた掲載価格はありません。参考価格や以前の登録値を現在の販売価格として扱わないでください。</p>')+
      '<p style="font-size:11px;color:#68748a;line-height:1.6">'+escapeText(message)+'</p>'+
      (item.photoSourceUrl&&safeLink(item.photoSourceUrl)?'<p style="font-size:11px;color:#68748a">写真：'+escapeText(item.photoKind==='representative'?'カテゴリの参考画像（実商品とは異なります）':'登録商品・参照元')+' <a href="'+escapeText(safeLink(item.photoSourceUrl))+'" target="_blank" rel="noopener noreferrer">出典を確認</a></p>':'')+
      '<div class="detail-action">'+
      (url?'<a href="'+escapeText(url)+'" target="_blank" rel="noopener noreferrer">販売ページで価格を確認</a>':'')+
      '<button type="button" data-action="research" data-id="'+escapeText(item.id)+'">商品をウェブで価格調査</button>'+
      (NATIVE?'<button type="button" data-action="edit" data-id="'+escapeText(item.id)+'">登録価格・目標・在庫を編集</button><button type="button" data-action="photo" data-id="'+escapeText(item.id)+'">iPhoneの写真を設定</button>':'')+
      (!item.purchased?'<button type="button" class="confirm-purchase" data-action="purchase" data-id="'+escapeText(item.id)+'">購入済みにする</button>':'')+
      '</div>';
    el('detailDialog').showModal();
  }
  function research(item){
    const link='https://www.google.com/search?tbm=shop&q='+encodeURIComponent(item.name);
    window.open(link,'_blank','noopener,noreferrer');
    toast('検索結果を開きました。商品・容量・沖縄送料を確認してください。');
  }
  function runNative(action,fields={}){
    if(!NATIVE){toast('実データの編集はiPhoneのScriptable版で利用できます');return}
    const search=new URLSearchParams({action,...fields});
    location.href='https://open.scriptable.app/run/YOS%20Shopping?'+search.toString();
  }
  function addItem(event){
    event.preventDefault();
    if(!NATIVE){toast('プレビューからはNotionへ保存できません');return}
    // Personal input is collected by Scriptable's native secure dialog, never a public web form.
    el('itemDialog').close();
    runNative('add');
  }
  function purchase(item){
    if(!NATIVE||!item.updatedAt||state.demo){toast('Notionの更新にはScriptableが必要です');return}
    runNative('purchase',{id:item.id,expectedEditedAt:item.updatedAt});
  }
  function install(){
    if(NATIVE&&NATIVE.schema==='yos-shopping-local-v1'&&Array.isArray(NATIVE.items)){
      setData(NATIVE.items,false);
    }else{
      setData(demoItems(),true);
      el('authPanel').hidden=false;
      el('authMessage').textContent='この画面はデザインプレビューです。実際のNotion商品はiPhoneの「YOS Shopping」Scriptableから開いてください。';
    }
    el('sortBy').value=state.sort;
    el('sortBy').addEventListener('change',event=>{state.sort=event.target.value;render()});
    el('searchToggle').addEventListener('click',()=>{
      const wrap=el('searchWrap');wrap.hidden=!wrap.hidden;
      el('searchToggle').setAttribute('aria-expanded',String(!wrap.hidden));if(!wrap.hidden)el('searchInput').focus()
    });
    el('searchInput').addEventListener('input',event=>{state.search=event.target.value;render()});
    el('clearSearch').addEventListener('click',()=>{el('searchInput').value='';state.search='';render()});
    el('addToggle').addEventListener('click',()=>NATIVE?runNative('add'):el('itemDialog').showModal());
    el('itemForm').addEventListener('submit',addItem);
    el('moreToggle').addEventListener('click',()=>NATIVE?runNative('refresh'):toast('実際の更新はScriptable版で利用できます'));
    el('listMode').addEventListener('click',()=>{state.view='list';store(VIEW_KEY,state.view);render()});
    el('gridMode').addEventListener('click',()=>{state.view='grid';store(VIEW_KEY,state.view);render()});
    document.addEventListener('click',event=>{
      const target=event.target.closest('button,[data-filter]');
      if(!target)return;
      if(target.hasAttribute('data-close')){target.closest('dialog')?.close();return}
      if(target.dataset.filter){filter(target.dataset.filter);return}
      if(target.dataset.bottom){
        if(target.dataset.bottom==='history'){
          filter('sale');toast('登録価格との差を表示中。継続した価格履歴グラフは未接続です。');
        }else if(target.dataset.bottom==='stock')filter('stock');
        else filter(target.dataset.bottom);
        return;
      }
      const action=target.dataset.action;if(!action)return;
      if(action==='clear'){filter('all');return}
      const item=state.items.find(x=>x.id===target.dataset.id);
      if(!item)return;
      if(action==='favorite'){
        if(state.favorites.has(item.id))state.favorites.delete(item.id);else state.favorites.add(item.id);
        store(FAVORITES_KEY,[...state.favorites]);render();
      }
      if(action==='detail')detail(item);
      if(action==='research')research(item);
      if(action==='purchase')purchase(item);
      if(action==='edit')runNative('edit',{id:item.id,expectedEditedAt:item.updatedAt||''});
      if(action==='photo')runNative('photo',{id:item.id,expectedEditedAt:item.updatedAt||''});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
