'use strict';
(()=>{
 const root=document.documentElement;
 const themes=[['sage','セージ','穏やかなグリーン'],['sand','サンド','暖かいベージュ'],['mist','ミスト','静かなブルー']];
 const titles={home:'MY WAY',life:'MY LIFE',money:'MY MONEY',journey:'MY JOURNEY',idea:'MY IDEA',archive:'MY WAY'};
 const order=['home','life','money','journey','idea'];
 const base=new URL('./',document.querySelector('script[src*="ui-harmony.js"]').src);
 const isMain=location.pathname===base.pathname||location.pathname===base.pathname+'index.html';
 function domain(){return document.body.dataset.domain||'home'}
 function syncTitle(){const title=document.getElementById('mywayTitle');if(title)title.textContent=titles[domain()]||'MY WAY'}
 function applyTheme(value){if(!themes.some(t=>t[0]===value))return;root.dataset.mywayTheme=value;try{localStorage.setItem('yos-ui-theme-v1',value)}catch{const status=document.getElementById('mywayThemeStatus');if(status)status.textContent='この画面には反映しました。配色を保存できませんでした。'}document.querySelectorAll('[data-myway-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mywayThemeChoice===value)));document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(root).getPropertyValue('--ui-bg').trim())}
 const dialog=document.createElement('dialog');dialog.id='mywayThemeDialog';dialog.className='myway-theme-dialog';dialog.setAttribute('aria-labelledby','mywayThemeTitle');
 dialog.innerHTML='<h2 id="mywayThemeTitle">配色</h2><p>全ページを同じ色合いに揃えます。</p><div class="myway-theme-options"></div><p id="mywayThemeStatus" role="status"></p><button type="button" class="myway-theme-close">閉じる</button>';
 for(const [id,name,copy] of themes){const b=document.createElement('button');b.type='button';b.dataset.mywayThemeChoice=id;b.innerHTML=`<i aria-hidden="true"></i><span><b>${name}</b><small>${copy}</small></span>`;b.addEventListener('click',()=>applyTheme(id));dialog.querySelector('.myway-theme-options').append(b)}
 document.body.append(dialog);dialog.querySelector('.myway-theme-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 document.querySelector('.myway-theme-button')?.addEventListener('click',()=>{document.getElementById('mywayThemeStatus').textContent='';applyTheme(root.dataset.mywayTheme);dialog.showModal()});
 const tools=document.createElement('button');tools.type='button';tools.className='myway-tools-button';tools.textContent='≡';tools.setAttribute('aria-label','設定・メニュー');tools.addEventListener('click',()=>{const target=document.getElementById('openMenu')||document.getElementById('editProfile')||document.querySelector('[data-open-page="improve"]');target?.click()});document.querySelector('.myway-header')?.append(tools);
 new MutationObserver(syncTitle).observe(document.body,{attributes:true,attributeFilter:['data-domain']});syncTitle();applyTheme(root.dataset.mywayTheme);
 window.addEventListener('storage',e=>{if(e.key==='yos-ui-theme-v1'&&e.newValue)applyTheme(e.newValue)});
 function go(name){if(isMain&&name!=='life'){document.dispatchEvent(new CustomEvent('myway:navigate',{detail:name}));return}const target=name==='life'?new URL('../life/',base):new URL(name==='home'?'./':`./#${name}`,base);location.href=target.href}
 // Preserve vertical scrolling, editable fields, sliders, roadmap scrolling and iOS edge gestures.
 function excluded(target){if(!(target instanceof Element))return true;if(document.querySelector('dialog[open]'))return true;if(target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="slider"],.roadmap,.money2-calendar,.calendar-strip'))return true;if(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return true;for(let e=target;e&&e!==document.body;e=e.parentElement){const x=getComputedStyle(e).overflowX;if((x==='auto'||x==='scroll')&&e.scrollWidth>e.clientWidth+2)return true}return false}
 let gesture=null;
 document.addEventListener('touchstart',e=>{gesture=null;if(e.touches.length!==1||excluded(e.target))return;const t=e.touches[0];if(t.clientX<24||t.clientX>innerWidth-24)return;gesture={x:t.clientX,y:t.clientY,time:Date.now()};},{passive:true});
 document.addEventListener('touchmove',e=>{if(!gesture)return;if(e.touches.length!==1||Math.abs(e.touches[0].clientY-gesture.y)>36)gesture=null;},{passive:true});
 document.addEventListener('touchcancel',()=>{gesture=null},{passive:true});
 document.addEventListener('touchend',e=>{const g=gesture;gesture=null;if(!g||e.changedTouches.length!==1||Date.now()-g.time>900||excluded(e.target))return;const t=e.changedTouches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;if(Math.abs(dx)<72||Math.abs(dx)<Math.abs(dy)*1.8)return;const index=order.indexOf(domain()),next=index+(dx<0?1:-1);if(index>=0&&next>=0&&next<order.length)go(order[next]);},{passive:true});
})();
