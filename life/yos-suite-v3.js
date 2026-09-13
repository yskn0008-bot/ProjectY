'use strict';
(()=>{
 const ready=()=>!!document.getElementById('lifePageHostV1')&&!document.querySelector('main.app .layout')&&!!document.getElementById('lifeBottomNavV1');
 const reveal=()=>{if(!ready())return false;document.documentElement.classList.remove('life-booting');document.getElementById('life-preinstall-guard')?.remove();const app=document.querySelector('main.app');if(app)app.style.removeProperty('visibility');return true};
 if(reveal())return;
 const timer=setInterval(()=>{if(reveal())clearInterval(timer)},40);
 setTimeout(()=>{clearInterval(timer);if(!reveal()){document.getElementById('lifeBootRetry')?.style.setProperty('display','inline');}},10000);
})();
