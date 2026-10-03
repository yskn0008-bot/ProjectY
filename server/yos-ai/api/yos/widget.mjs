import {waitUntil} from '@vercel/functions';
import {createProductionWidgetFeed} from '../../dist/widget/production.js';
import {createProductionBaseHomeRefreshHandler} from '../../dist/base-home/production.js';
import {createProductionMoneyNotionMirror} from '../../dist/intake/production.js';
import {createMoneyShadowHandler} from '../../lib/money-shadow.mjs';

let handler;
let moneyHandler;
let moneyNotionMirror;
let baseHomeRefreshHandler;
function getHandler(){
  handler ??= createProductionWidgetFeed({environment:process.env});
  return handler;
}
function getMoneyNotionMirror(){
  moneyNotionMirror ??= createProductionMoneyNotionMirror({environment:process.env});
  return moneyNotionMirror;
}
function getBaseHomeRefreshHandler(){
  baseHomeRefreshHandler ??= createProductionBaseHomeRefreshHandler({environment:process.env});
  return baseHomeRefreshHandler;
}
function getMoneyHandler(){
  moneyHandler ??= createMoneyShadowHandler({
    environment:process.env,
    onSnapshot(snapshot){
      try{
        waitUntil(
          getMoneyNotionMirror()(snapshot).catch(error=>{
            console.error(JSON.stringify({level:'warn',event:'yos_money_notion_mirror_failed',route:'/api/yos/widget',message:String(error?.message||error)}));
          })
        );
      }catch(error){
        console.error(JSON.stringify({level:'warn',event:'yos_money_notion_mirror_unavailable',route:'/api/yos/widget',message:String(error?.message||error)}));
      }
    }
  });
  return moneyHandler;
}

export default {
  async fetch(request){
    const mode=new URL(request.url).searchParams.get('mode');
    if(mode==='base-home-refresh'){
      try{return await getBaseHomeRefreshHandler()(request)}catch{
        console.error(JSON.stringify({level:'error',event:'yos_base_home_refresh_unavailable',route:'/api/yos/widget',stage:'app-init'}));
        return Response.json({error:'BASE HOME refresh is temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      }
    }
    if(mode==='money-shadow'||mode==='money-alert'){
      try{return await getMoneyHandler()(request)}catch{
        console.error(JSON.stringify({level:'error',event:'yos_money_shadow_unavailable',route:'/api/yos/widget',stage:'app-init'}));
        return Response.json({error:'Money shadow is temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      }
    }
    try{return await getHandler()(request)}catch{
      console.error(JSON.stringify({level:'error',event:'yos_widget_unavailable',route:'/api/yos/widget',stage:'app-init'}));
      return Response.json({error:'Widget feed is temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
  }
};
