'use strict';
(()=>{
  const API='https://project-y-yos-ai.vercel.app';
  const YOS_ORIGIN='https://yskn0008-bot.github.io';
  const FAVORITES_KEY='yos-shopping-favorites-v1';
  const VIEW_KEY='yos-shopping-view-v1';
  const GOOGLE_SCRIPT='https://accounts.google.com/gsi/client';
  const el=id=>document.getElementById(id);
  const state={items:[],token:'',demo:true,filter:'all',sort:'recommended',search:'',favorites:new Set(),view:'grid',busy:false};
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
  const buy=item=>!item.purchased&&(item.state==='購入候補'||(
    Number.isFinite(item.targetPrice)&&Number.isFinite(item.currentPrice)&&item.currentPrice<=item.targetPrice&&recentPrice(item)
  ));
  const recommend=item=>!item.purchased&&(sale(item)||buy(item)||restock(item));
  const verified=(item)=>!state.demo&&sale(item);
  const sortRank=item=> (restock(item)?100:0)+(sale(item)?60:0)+(buy(item)?30:0)+(item.priority==='高'?10:0);
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
    status(asDemo?'デザインプレビュー｜商品・価格はサンプルです（実際の値引きではありません）':
      'Notion YOS Shoppingと接続済み｜価格の最新性は商品ごとに確認');
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
  function imageBlock(item){
    const image=safeLink(item.imageUrl);
    return image?'<img loading="lazy" decoding="async" alt="'+escapeText(item.name)+'の商品写真" src="'+escapeText(image)+'">':
      '<div class="no-photo" aria-label="写真未登録"><span>'+escapeText(imgIcons[item.category]||'◈')+'</span><small>写真未登録</small></div>';
  }
  function badge(item){
    if(restock(item))return '<span class="flag restock">▣ 補充候補</span>';
    if(sale(item))return '<span class="flag" title="登録価格の差です。現在の価格と購入条件は要確認">◆ 値引き中</span>';
    return '';
  }
  function card(item){
    const favorite=state.favorites.has(item.id);
    const pct=diffPct(item);
    const url=safeLink(item.url);
    const priceKnown=Number.isFinite(item.currentPrice);
    const priceClass=priceKnown?'price-now':'price-now unknown';
    const purchaseStatus=item.purchased?'購入済':restock(item)?'補充する':buy(item)?'🛒 買い時':'価格監視';
    const statusClass=restock(item)?'purchase-status stock':buy(item)?'purchase-status':'purchase-status wait';
    return '<article class="product-card'+(item.purchased?' purchased':'')+'" data-id="'+escapeText(item.id)+'">'+
      badge(item)+
      '<div class="product-photo">'+imageBlock(item)+'</div>'+
      '<div class="product-details">'+
      '<div class="product-heading" title="'+escapeText(item.name)+'">'+escapeText(item.name)+'</div>'+
      '<button class="heart'+(favorite?' active':'')+'" type="button" data-action="favorite" data-id="'+escapeText(item.id)+'" aria-label="'+(favorite?'お気に入りから外す':'お気に入りに追加')+'">'+(favorite?'♥':'♡')+'</button>'+
      '<span class="category-tag">'+escapeText(item.category||item.type||'その他')+'</span>'+
      '<span class="'+statusClass+'">'+purchaseStatus+'</span>'+
      '<div class="price-row"><strong class="'+priceClass+'">'+yen(item.currentPrice)+'</strong>'+
      (pct&&sale(item)?'<del class="price-was">'+yen(item.referencePrice)+'</del><span class="discount-rate">'+pct+'% OFF</span>':'')+'</div>'+
      '<span class="store-label" title="'+escapeText(item.shop.join('・'))+'">'+(item.shop.length?'登録店: '+escapeText(item.shop.join('・')):'販売店未登録')+'</span>'+
      '<div class="product-actions"><button type="button" data-action="detail" data-id="'+escapeText(item.id)+'" aria-label="'+escapeText(item.name)+'の詳細">▥</button>'+
      (url?'<a href="'+escapeText(url)+'" target="_blank" rel="noopener noreferrer" aria-label="販売ページを確認">🛒</a>':
      '<button data-action="research" data-id="'+escapeText(item.id)+'" type="button" aria-label="価格を調査">⌕</button>')+
      '</div></div></article>';
  }
  function render(){
    const all=state.items.filter(x=>!x.purchased).length;
    number('allCount',all);number('saleCount',count(sale));number('chipSaleCount',count(sale));
    number('buyCount',count(buy));number('chipBuyCount',count(buy));
    number('stockCount',count(restock));number('chipStockCount',count(restock));number('recCount',count(recommend)+'件');
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
    const url=safeLink(item.url),pct=diffPct(item),photo=safeLink(item.imageUrl);
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
      '</dl></div>'+
      '<p style="font-size:11px;color:#68748a;line-height:1.6">'+escapeText(message)+'</p>'+
      '<div class="detail-action">'+
      (url?'<a href="'+escapeText(url)+'" target="_blank" rel="noopener noreferrer">販売ページで価格を確認</a>':'')+
      '<button type="button" data-action="research" data-id="'+escapeText(item.id)+'">商品をウェブで価格調査</button>'+
      (!item.purchased?'<button type="button" class="confirm-purchase" data-action="purchase" data-id="'+escapeText(item.id)+'">購入済みにする</button>':'')+
      '</div>';
    el('detailDialog').showModal();
  }
  function research(item){
    const link='https://www.google.com/search?tbm=shop&q='+encodeURIComponent(item.name);
    window.open(link,'_blank','noopener,noreferrer');
    toast('検索結果を開きました。商品・容量・沖縄送料を確認してください。');
  }
  async function load(){
    if(!state.token)return;
    status('Notionの買い物リストを取得しています…');
    const resp=await fetch(API+'/api/yos/shopping',{headers:{Authorization:'Bearer '+state.token,Accept:'application/json'},cache:'no-store',credentials:'omit'});
    if(!resp.ok)throw new Error('Shopping '+resp.status);
    const data=await resp.json();
    if(data.schema!=='yos-shopping-v1'||!Array.isArray(data.items))throw new Error('Invalid shopping data');
    setData(data.items,false);el('authPanel').hidden=true;
  }
  function loadScript(){
    return new Promise((resolve,reject)=>{
      if(globalThis.google?.accounts?.id)return resolve(globalThis.google.accounts.id);
      const script=document.createElement('script');script.src=GOOGLE_SCRIPT;script.async=true;script.defer=true;
      script.onload=()=>globalThis.google?.accounts?.id?resolve(globalThis.google.accounts.id):reject(new Error('Google ID unavailable'));
      script.onerror=()=>reject(new Error('Google script unavailable'));document.head.append(script);
    });
  }
  async function setupAuth(){
    if(location.origin!==YOS_ORIGIN){
      el('authPanel').hidden=false;el('authMessage').textContent='デザインプレビューです。実データ接続はYOSの公開ドメイン上で本人確認後に利用できます。';
      return;
    }
    el('authPanel').hidden=false;
    try{
      const [response,gsi]=await Promise.all([fetch(API+'/api/yos/public-config',{cache:'no-store',credentials:'omit'}),loadScript()]);
      if(!response.ok)throw new Error('Config unavailable');
      const config=await response.json();if(!String(config.googleClientId||'').endsWith('.apps.googleusercontent.com'))throw new Error('Client unavailable');
      gsi.initialize({client_id:config.googleClientId,callback:async payload=>{
        const token=String(payload?.credential||'');
        if(!token){toast('本人確認が完了しませんでした');return}
        state.token=token;try{await load()}catch{toast('Notion商品を取得できません。元データは変更していません。');status('接続未確認｜プレビュー表示中')}
      },auto_select:false,cancel_on_tap_outside:true,itp_support:true,use_fedcm_for_prompt:true});
      gsi.renderButton(el('authButton'),{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:270});
    }catch{
      el('authMessage').textContent='本人確認を読み込めませんでした。プレビューは操作できますがNotionへの保存はできません。';
    }
  }
  async function addItem(event){
    event.preventDefault();
    if(state.busy)return;
    if(!state.token){toast('プレビューでは保存できません。本人確認後に追加してください。');return}
    const form=event.currentTarget,data=new FormData(form);
    const name=String(data.get('name')||'').trim();
    if(!name)return;
    state.busy=true;el('addSubmit').disabled=true;el('addError').hidden=true;
    try{
      const res=await fetch(API+'/api/yos/shopping',{method:'POST',
        headers:{Authorization:'Bearer '+state.token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'add',name,category:data.get('category'),url:data.get('url'),imageUrl:data.get('imageUrl')}),
        cache:'no-store',credentials:'omit'});
      if(!res.ok)throw new Error('save not confirmed');
      // Successful create alone is not a full success; re-read the authoritative list.
      await load();
      form.reset();el('itemDialog').close();toast('Notionの買い物リストに追加しました');
    }catch{
      el('addError').hidden=false;el('addError').textContent='保存結果を確認できません。Notionを確認してから再試行してください（重複防止）。';
    }finally{state.busy=false;el('addSubmit').disabled=false}
  }
  async function purchase(item){
    if(state.demo||!state.token){toast('プレビューでは購入状態を変更できません');return}
    if(!item.updatedAt){toast('更新日時を確認できません。再取得してください');return}
    if(!window.confirm('「'+item.name+'」を購入済みにしますか？（購入自体は行いません）'))return;
    if(state.busy)return;
    state.busy=true;try{
      const res=await fetch(API+'/api/yos/shopping',{method:'PATCH',
        headers:{Authorization:'Bearer '+state.token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'purchase',id:item.id,expectedEditedAt:item.updatedAt}),
        cache:'no-store',credentials:'omit'});
      if(!res.ok)throw new Error('Purchase update uncertain');
      await load();el('detailDialog').close();toast('購入済みをNotionに反映しました');
    }catch{toast('更新を確認できませんでした。Notionの状態を確認してください')}
    finally{state.busy=false}
  }
  function install(){
    setData(demoItems(),true);
    el('sortBy').value=state.sort;
    el('sortBy').addEventListener('change',event=>{state.sort=event.target.value;render()});
    el('searchToggle').addEventListener('click',()=>{
      const wrap=el('searchWrap');wrap.hidden=!wrap.hidden;
      el('searchToggle').setAttribute('aria-expanded',String(!wrap.hidden));if(!wrap.hidden)el('searchInput').focus()
    });
    el('searchInput').addEventListener('input',event=>{state.search=event.target.value;render()});
    el('clearSearch').addEventListener('click',()=>{el('searchInput').value='';state.search='';render()});
    el('addToggle').addEventListener('click',()=>el('itemDialog').showModal());
    el('itemForm').addEventListener('submit',addItem);
    el('moreToggle').addEventListener('click',()=>{const n='既存Notion「YOS Shopping」を正本として表示。値引き率は参考価格との差であり、購入前に店舗と送料の確認が必要です。';window.alert(n)});
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
    });
    setupAuth();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
