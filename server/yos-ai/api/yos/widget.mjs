import {createProductionWidgetFeed} from '../../dist/widget/production.js';
import {createMoneyShadowHandler} from '../../lib/money-shadow.mjs';

let handler;
let moneyHandler;
function getHandler(){
  handler ??= createProductionWidgetFeed({environment:process.env});
  return handler;
}
function getMoneyHandler(){
  moneyHandler ??= createMoneyShadowHandler({environment:process.env});
  return moneyHandler;
}

export default {
  async fetch(request){
    const mode=new URL(request.url).searchParams.get('mode');
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
